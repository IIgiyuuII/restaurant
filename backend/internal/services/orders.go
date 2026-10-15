package services

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
)

const (
	maxOrderLines   = 50
	maxDishPortions = 100
)

const (
	StatusCreated  = "created"
	StatusRejected = "rejected"
)

type OrderService struct{ pool *pgxpool.Pool }

func NewOrderService(pool *pgxpool.Pool) *OrderService {
	return &OrderService{pool: pool}
}

// need — сколько продукта нужно на весь заказ (в тысячных долях единицы).
type need struct {
	productID string
	name      string
	unit      string
	milli     int64
}

// lockedBatch — живая партия, заблокированная FOR UPDATE.
type lockedBatch struct {
	id      string
	milli   int64
	expires time.Time
}

// allocation — запланированное списание из конкретной партии.
type allocation struct {
	batchID   string
	productID string
	milli     int64
	expires   time.Time
}

// Create обрабатывает заказ.
//
//  1. Раскладываем блюда на ингредиенты (рецепты).
//  2. Блокируем живые партии нужных продуктов (FOR UPDATE, ORDER BY expires_at)
//     в детерминированном порядке продуктов — защита от дедлоков.
//  3. Если хватает всего — списываем по FEFO и пишем журнал.
//     Если нет — заказ сохраняется как rejected (склад не меняется).
//
// Возвращает ответ со Status=created либо Status=rejected (это не error).
func (s *OrderService) Create(ctx context.Context, req models.CreateOrderRequest) (*models.OrderResponse, error) {
	items, err := normalizeOrder(req)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// ---- 1. Блюда и потребность в ингредиентах ----
	needs := map[string]*need{}
	views := make([]models.OrderItemView, 0, len(items))

	for _, it := range items {
		var dishName string
		err := tx.QueryRow(ctx,
			`SELECT name FROM dishes WHERE id = $1::uuid AND is_active`, it.DishID,
		).Scan(&dishName)
		if errors.Is(err, pgx.ErrNoRows) || pgCode(err) == pgInvalidText {
			return nil, validation("блюдо %q не найдено или снято с продажи", it.DishID)
		}
		if err != nil {
			return nil, err
		}
		views = append(views, models.OrderItemView{DishID: it.DishID, Name: dishName, Quantity: it.Quantity})

		if err := addRecipeNeeds(ctx, tx, needs, it, dishName); err != nil {
			return nil, err
		}
	}

	// ---- 2. Блокировка партий в детерминированном порядке ----
	pids := make([]string, 0, len(needs))
	for pid := range needs {
		pids = append(pids, pid)
	}
	sort.Strings(pids)

	var plan []allocation
	var shortages []models.Shortage

	for _, pid := range pids {
		n := needs[pid]

		batches, err := lockLiveBatches(ctx, tx, pid)
		if err != nil {
			return nil, err
		}

		var available int64
		for _, b := range batches {
			available += b.milli
		}
		if available < n.milli {
			shortages = append(shortages, models.Shortage{
				ProductID: pid, Product: n.name, Unit: n.unit,
				Needed: float64(n.milli) / 1000, Available: float64(available) / 1000,
			})
			continue
		}

		// FEFO: batches уже отсортированы по expires_at — берём раньше истекающие первыми.
		left := n.milli
		for _, b := range batches {
			if left == 0 {
				break
			}
			take := min(b.milli, left)
			plan = append(plan, allocation{batchID: b.id, productID: pid, milli: take, expires: b.expires})
			left -= take
		}
	}

	// ---- Отказ: склад не трогаем, сохраняем rejected-заказ ----
	if len(shortages) > 0 {
		_ = tx.Rollback(ctx) // сразу снимаем блокировки партий
		sort.Slice(shortages, func(i, j int) bool { return shortages[i].Product < shortages[j].Product })
		return s.recordRejected(ctx, views, shortages)
	}

	// ---- 3. Успех: заказ, списание, журнал ----
	resp := &models.OrderResponse{Status: StatusCreated, Items: views}
	err = tx.QueryRow(ctx,
		`INSERT INTO orders (status) VALUES ('created') RETURNING id, number, created_at`,
	).Scan(&resp.ID, &resp.Number, &resp.CreatedAt)
	if err != nil {
		return nil, err
	}
	if err := insertOrderItems(ctx, tx, resp.ID, views); err != nil {
		return nil, err
	}

	for _, a := range plan {
		// Правая часть UPDATE видит старое значение remaining_quantity,
		// поэтому статус depleted выставляем по тому же выражению.
		_, err := tx.Exec(ctx,
			`UPDATE batches
			    SET remaining_quantity = remaining_quantity - ($2::bigint::numeric / 1000),
			        status = CASE WHEN remaining_quantity - ($2::bigint::numeric / 1000) = 0
			                      THEN 'depleted' ELSE status END,
			        updated_at = now()
			  WHERE id = $1::uuid`,
			a.batchID, a.milli)
		if err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO stock_movements (batch_id, product_id, type, delta, order_id)
			 VALUES ($1::uuid, $2::uuid, 'order', -($3::bigint::numeric / 1000), $4::uuid)`,
			a.batchID, a.productID, a.milli, resp.ID)
		if err != nil {
			return nil, err
		}
		n := needs[a.productID]
		resp.WriteOffs = append(resp.WriteOffs, models.WriteOff{
			ProductID: a.productID, Product: n.name, Unit: n.unit, BatchID: a.batchID,
			Quantity: float64(a.milli) / 1000, ExpiresAt: a.expires.UTC(),
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	resp.CreatedAt = resp.CreatedAt.UTC()
	return resp, nil
}

// recordRejected сохраняет отклонённый заказ в отдельной короткой транзакции.
func (s *OrderService) recordRejected(ctx context.Context, views []models.OrderItemView, shortages []models.Shortage) (*models.OrderResponse, error) {
	reason := buildReason(shortages)
	resp := &models.OrderResponse{Status: StatusRejected, Reason: reason, Items: views, Shortages: shortages}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	err = tx.QueryRow(ctx,
		`INSERT INTO orders (status, reason) VALUES ('rejected', $1) RETURNING id, number, created_at`,
		reason,
	).Scan(&resp.ID, &resp.Number, &resp.CreatedAt)
	if err != nil {
		return nil, err
	}
	if err := insertOrderItems(ctx, tx, resp.ID, views); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	resp.CreatedAt = resp.CreatedAt.UTC()
	return resp, nil
}

// addRecipeNeeds добавляет в needs ингредиенты блюда × количество порций.
func addRecipeNeeds(ctx context.Context, tx pgx.Tx, needs map[string]*need, it models.OrderItemInput, dishName string) error {
	rows, err := tx.Query(ctx,
		`SELECT di.product_id, p.name, p.unit, (di.quantity * 1000)::bigint
		   FROM dish_ingredients di
		   JOIN products p ON p.id = di.product_id
		  WHERE di.dish_id = $1::uuid`, it.DishID)
	if err != nil {
		return err
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var pid, name, unit string
		var perPortion int64
		if err := rows.Scan(&pid, &name, &unit, &perPortion); err != nil {
			return err
		}
		n, ok := needs[pid]
		if !ok {
			n = &need{productID: pid, name: name, unit: unit}
			needs[pid] = n
		}
		n.milli += perPortion * int64(it.Quantity)
		count++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if count == 0 {
		return validation("у блюда %q не задан состав", dishName)
	}
	return nil
}

// lockLiveBatches блокирует и возвращает живые партии продукта, самые «ранние» — первыми.
func lockLiveBatches(ctx context.Context, tx pgx.Tx, productID string) ([]lockedBatch, error) {
	rows, err := tx.Query(ctx,
		`SELECT id, (remaining_quantity * 1000)::bigint, expires_at
		   FROM batches
		  WHERE product_id = $1::uuid
		    AND status = 'active'
		    AND remaining_quantity > 0
		    AND expires_at > now()
		  ORDER BY expires_at, id
		    FOR UPDATE`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []lockedBatch
	for rows.Next() {
		var b lockedBatch
		if err := rows.Scan(&b.id, &b.milli, &b.expires); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// После ожидания блокировки Postgres может вернуть строки не по порядку —
	// пересортировываем, чтобы FEFO был гарантирован.
	sort.SliceStable(out, func(i, j int) bool { return out[i].expires.Before(out[j].expires) })
	return out, nil
}

func insertOrderItems(ctx context.Context, tx pgx.Tx, orderID string, views []models.OrderItemView) error {
	for _, v := range views {
		_, err := tx.Exec(ctx,
			`INSERT INTO order_items (order_id, dish_id, quantity) VALUES ($1::uuid, $2::uuid, $3)`,
			orderID, v.DishID, v.Quantity)
		if err != nil {
			return err
		}
	}
	return nil
}

// normalizeOrder валидирует заказ и склеивает повторяющиеся блюда.
func normalizeOrder(req models.CreateOrderRequest) ([]models.OrderItemInput, error) {
	if len(req.Items) == 0 {
		return nil, validation("заказ пуст")
	}
	if len(req.Items) > maxOrderLines {
		return nil, validation("слишком много позиций (максимум %d)", maxOrderLines)
	}

	merged := map[string]int{}
	var order []string
	for i, it := range req.Items {
		id := strings.ToLower(strings.TrimSpace(it.DishID))
		if id == "" {
			return nil, validation("позиция %d: не указан dish_id", i+1)
		}
		if it.Quantity <= 0 || it.Quantity > maxDishPortions {
			return nil, validation("позиция %d: quantity должен быть от 1 до %d", i+1, maxDishPortions)
		}
		if _, seen := merged[id]; !seen {
			order = append(order, id)
		}
		merged[id] += it.Quantity
		if merged[id] > maxDishPortions {
			return nil, validation("блюдо %q: не более %d порций в заказе", id, maxDishPortions)
		}
	}

	out := make([]models.OrderItemInput, 0, len(order))
	for _, id := range order {
		out = append(out, models.OrderItemInput{DishID: id, Quantity: merged[id]})
	}
	return out, nil
}

// buildReason: «Не хватает: Сыр Моцарелла — нужно 300 г, есть 200 г; …».
func buildReason(shortages []models.Shortage) string {
	parts := make([]string, 0, len(shortages))
	for _, s := range shortages {
		parts = append(parts, fmt.Sprintf("%s — нужно %s, есть %s",
			s.Product, formatQty(s.Needed, s.Unit), formatQty(s.Available, s.Unit)))
	}
	return "Не хватает: " + strings.Join(parts, "; ")
}

func formatQty(v float64, unit string) string {
	ru := map[string]string{"g": "г", "ml": "мл", "pcs": "шт"}[unit]
	if ru == "" {
		ru = unit
	}
	return strconv.FormatFloat(v, 'f', -1, 64) + " " + ru
}
