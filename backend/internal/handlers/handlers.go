package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
	"github.com/IIgiyuuII/restaurant/backend/internal/services"
)

const maxBodyBytes = 1 << 20 // 1 MiB

type API struct {
	pool       *pgxpool.Pool
	deliveries *services.DeliveryService
	orders     *services.OrderService
}

func New(pool *pgxpool.Pool) *API {
	return &API{
		pool:       pool,
		deliveries: services.NewDeliveryService(pool),
		orders:     services.NewOrderService(pool),
	}
}

// Mount регистрирует маршруты на роутере.
func (a *API) Mount(r chi.Router) {
	r.Post("/api/deliveries", a.createDelivery)
	r.Post("/api/orders", a.createOrder)
	r.Get("/api/dishes", a.listDishes)
	r.Get("/api/batches", a.listBatches)
	r.Get("/api/orders", a.listOrders)
}

func (a *API) createDelivery(w http.ResponseWriter, r *http.Request) {
	var req models.CreateDeliveryRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	resp, err := a.deliveries.Create(r.Context(), req)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (a *API) createOrder(w http.ResponseWriter, r *http.Request) {
	var req models.CreateOrderRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	resp, err := a.orders.Create(r.Context(), req)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	// Отказ из-за нехватки ингредиентов — штатная ситуация: 409 + тело с причиной.
	if resp.Status == services.StatusRejected {
		writeJSON(w, http.StatusConflict, resp)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

// listDishes — меню с количеством доступных порций (portions = 0 → стоп-лист).
func (a *API) listDishes(w http.ResponseWriter, r *http.Request) {
	rows, err := a.pool.Query(r.Context(),
		`SELECT dish_id, name, price::float8, portions FROM dish_availability ORDER BY name`)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	defer rows.Close()

	out := []models.DishAvailability{}
	for rows.Next() {
		var d models.DishAvailability
		if err := rows.Scan(&d.ID, &d.Name, &d.Price, &d.Portions); err != nil {
			writeServiceError(w, err)
			return
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// listBatches — живые партии (active, остаток > 0), раньше истекающие — первыми.
// Просроченные, но ещё не списанные партии тоже возвращаются (expired = true),
// чтобы их было видно в интерфейсе. Фильтр: ?product_id=<uuid>.
func (a *API) listBatches(w http.ResponseWriter, r *http.Request) {
	productID := r.URL.Query().Get("product_id")

	rows, err := a.pool.Query(r.Context(),
		`SELECT b.id, p.id, p.name, p.unit, d.number,
		        b.initial_quantity::float8, b.remaining_quantity::float8,
		        b.received_at, b.expires_at
		   FROM batches b
		   JOIN products   p ON p.id = b.product_id
		   JOIN deliveries d ON d.id = b.delivery_id
		  WHERE b.status = 'active' AND b.remaining_quantity > 0
		    AND ($1 = '' OR b.product_id::text = $1)
		  ORDER BY b.expires_at, p.name`, productID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	defer rows.Close()

	now := time.Now()
	out := []models.BatchStock{}
	for rows.Next() {
		var b models.BatchStock
		if err := rows.Scan(&b.ID, &b.ProductID, &b.Product, &b.Unit, &b.DeliveryNumber,
			&b.InitialQty, &b.RemainingQty, &b.ReceivedAt, &b.ExpiresAt); err != nil {
			writeServiceError(w, err)
			return
		}
		b.HoursLeft = b.ExpiresAt.Sub(now).Hours()
		b.Expired = b.HoursLeft <= 0
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// listOrders — последние заказы (по умолчанию 20, максимум 100): ?limit=N.
func (a *API) listOrders(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 100 {
		limit = v
	}

	rows, err := a.pool.Query(r.Context(),
		`SELECT o.id, o.number, o.status, COALESCE(o.reason, ''), o.created_at,
		        COALESCE(
		          json_agg(json_build_object('name', d.name, 'quantity', oi.quantity)
		                   ORDER BY d.name) FILTER (WHERE d.id IS NOT NULL),
		          '[]'::json)::text
		   FROM orders o
		   LEFT JOIN order_items oi ON oi.order_id = o.id
		   LEFT JOIN dishes d       ON d.id = oi.dish_id
		  GROUP BY o.id
		  ORDER BY o.number DESC
		  LIMIT $1`, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	defer rows.Close()

	out := []models.OrderHistory{}
	for rows.Next() {
		var o models.OrderHistory
		var itemsJSON string
		if err := rows.Scan(&o.ID, &o.Number, &o.Status, &o.Reason, &o.CreatedAt, &itemsJSON); err != nil {
			writeServiceError(w, err)
			return
		}
		if err := json.Unmarshal([]byte(itemsJSON), &o.Items); err != nil {
			writeServiceError(w, err)
			return
		}
		out = append(out, o)
	}
	if err := rows.Err(); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный JSON: "+err.Error())
		return false
	}
	return true
}

// writeServiceError переводит ошибки сервисов в HTTP-ответы.
// Внутренние ошибки (SQL и т.п.) наружу не отдаём — только в лог.
func writeServiceError(w http.ResponseWriter, err error) {
	var ve *services.ValidationError
	var ce *services.ConflictError
	switch {
	case errors.As(err, &ve):
		writeError(w, http.StatusBadRequest, ve.Msg)
	case errors.As(err, &ce):
		writeError(w, http.StatusConflict, ce.Msg)
	default:
		log.Printf("internal error: %v", err)
		writeError(w, http.StatusInternalServerError, "внутренняя ошибка сервера")
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
