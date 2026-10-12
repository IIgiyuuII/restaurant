package services

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
)

const (
	maxDeliveryItems  = 200
	maxItemQuantity   = 100_000_000.0 // numeric(12,3) с запасом
	maxShelfLifeHours = 24 * 365 * 10
)

type DeliveryService struct{ pool *pgxpool.Pool }

func NewDeliveryService(pool *pgxpool.Pool) *DeliveryService {
	return &DeliveryService{pool: pool}
}

// Create принимает поставку: создаёт поставку, по партии на каждую позицию
// и запись `receipt` в журнале — всё в одной транзакции.
func (s *DeliveryService) Create(ctx context.Context, req models.CreateDeliveryRequest) (*models.DeliveryResponse, error) {
	if len(req.Items) == 0 {
		return nil, validation("поставка не содержит продуктов")
	}
	if len(req.Items) > maxDeliveryItems {
		return nil, validation("слишком много позиций (максимум %d)", maxDeliveryItems)
	}

	date := time.Now().UTC()
	if req.DeliveryDate != nil {
		date = req.DeliveryDate.UTC()
		if date.After(time.Now().Add(5 * time.Minute)) {
			return nil, validation("delivery_date не может быть в будущем")
		}
	}

	// Количества считаем в целых тысячных долях — без ошибок float.
	milli := make([]int64, len(req.Items))
	for i, it := range req.Items {
		n := i + 1
		if strings.TrimSpace(it.ProductID) == "" {
			return nil, validation("позиция %d: не указан product_id", n)
		}
		if math.IsNaN(it.Quantity) || it.Quantity <= 0 || it.Quantity > maxItemQuantity {
			return nil, validation("позиция %d: quantity должен быть > 0 и ≤ %.0f", n, maxItemQuantity)
		}
		milli[i] = int64(math.Round(it.Quantity * 1000))
		if milli[i] <= 0 {
			return nil, validation("позиция %d: слишком маленькое количество", n)
		}
		if math.IsNaN(it.ShelfLifeHours) || it.ShelfLifeHours <= 0 || it.ShelfLifeHours > maxShelfLifeHours {
			return nil, validation("позиция %d: shelf_life_hours должен быть > 0", n)
		}
	}

	number := strings.TrimSpace(req.Number)
	if number == "" {
		number = fmt.Sprintf("D-%s-%04d", date.Format("20060102-150405"), rand.Intn(10000))
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // после Commit вернёт ErrTxClosed — это нормально

	resp := &models.DeliveryResponse{Number: number, DeliveryDate: date}

	err = tx.QueryRow(ctx,
		`INSERT INTO deliveries (number, delivery_date)
		 VALUES ($1, $2::timestamptz)
		 RETURNING id, created_at`,
		number, date,
	).Scan(&resp.ID, &resp.CreatedAt)
	if err != nil {
		if pgCode(err) == pgUniqueViolation {
			return nil, &ConflictError{Msg: fmt.Sprintf("поставка с номером %q уже существует", number)}
		}
		return nil, err
	}

	for i, it := range req.Items {
		n := i + 1

		// Продукт: проверяем существование и берём название/единицу для ответа.
		var pname, unit string
		err := tx.QueryRow(ctx,
			`SELECT name, unit FROM products WHERE id = $1::uuid`, it.ProductID,
		).Scan(&pname, &unit)
		if errors.Is(err, pgx.ErrNoRows) || pgCode(err) == pgInvalidText {
			return nil, validation("позиция %d: продукт %q не найден", n, it.ProductID)
		}
		if err != nil {
			return nil, err
		}

		// Партия. expires_at = received_at + shelf_life — считается в SQL.
		var batchID string
		var expiresAt time.Time
		err = tx.QueryRow(ctx,
			`INSERT INTO batches
			   (delivery_id, product_id, initial_quantity, remaining_quantity,
			    shelf_life, received_at, expires_at)
			 VALUES
			   ($1::uuid, $2::uuid, $3::bigint::numeric / 1000, $3::bigint::numeric / 1000,
			    make_interval(secs => $4::float8),
			    $5::timestamptz,
			    $5::timestamptz + make_interval(secs => $4::float8))
			 RETURNING id, expires_at`,
			resp.ID, it.ProductID, milli[i], it.ShelfLifeHours*3600, date,
		).Scan(&batchID, &expiresAt)
		if err != nil {
			return nil, err
		}

		// Приход в журнал движений.
		_, err = tx.Exec(ctx,
			`INSERT INTO stock_movements (batch_id, product_id, type, delta, created_at)
			 VALUES ($1::uuid, $2::uuid, 'receipt', $3::bigint::numeric / 1000, $4::timestamptz)`,
			batchID, it.ProductID, milli[i], date,
		)
		if err != nil {
			return nil, err
		}

		resp.Batches = append(resp.Batches, models.BatchView{
			ID:             batchID,
			ProductID:      it.ProductID,
			Product:        pname,
			Unit:           unit,
			Quantity:       float64(milli[i]) / 1000,
			ShelfLifeHours: it.ShelfLifeHours,
			ReceivedAt:     date,
			ExpiresAt:      expiresAt.UTC(),
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return resp, nil
}
