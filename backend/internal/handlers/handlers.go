package handlers

import (
	"encoding/json"
	"errors"
	"io"
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
	hotOffers  *services.HotOffersService
	restock    *services.RestockService
	expiry     *services.ExpiryService
}

// New: expiry создаётся в main, потому что тот же экземпляр запускает фоновое автосписание.
func New(pool *pgxpool.Pool, expiry *services.ExpiryService) *API {
	return &API{
		pool:       pool,
		deliveries: services.NewDeliveryService(pool),
		orders:     services.NewOrderService(pool),
		hotOffers:  services.NewHotOffersService(pool),
		restock:    services.NewRestockService(pool),
		expiry:     expiry,
	}
}

// Mount регистрирует маршруты на роутере.
func (a *API) Mount(r chi.Router) {
	r.Get("/health", a.health)
	r.Get("/api/products", a.listProducts)
	r.Get("/api/stoplist", a.listStoplist)
	r.Post("/api/deliveries", a.createDelivery)
	r.Post("/api/orders", a.createOrder)
	r.Get("/api/dishes", a.listDishes)
	r.Get("/api/batches", a.listBatches)
	r.Get("/api/orders", a.listOrders)
	r.Get("/api/hot-offers", a.listHotOffers)
	r.Get("/api/restock", a.listRestock)
	r.Get("/api/writeoffs", a.expiryReport)
	r.Post("/api/writeoffs", a.writeOffExpired)
}

// health проверяет, что бэкенд жив и видит базу.
func (a *API) health(w http.ResponseWriter, r *http.Request) {
	if err := a.pool.Ping(r.Context()); err != nil {
		log.Printf("health: db ping failed: %v", err)
		http.Error(w, "db down", http.StatusInternalServerError)
		return
	}
	_, _ = w.Write([]byte("ok"))
}

// listProducts — остатки по продуктам (живые непросроченные партии).
func (a *API) listProducts(w http.ResponseWriter, r *http.Request) {
	rows, err := a.pool.Query(r.Context(),
		`SELECT product_id, name, unit, total_quantity::float8, nearest_expiry
		   FROM product_stock ORDER BY name`)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	defer rows.Close()

	out := []models.ProductStock{}
	for rows.Next() {
		var p models.ProductStock
		if err := rows.Scan(&p.ID, &p.Name, &p.Unit, &p.Quantity, &p.NearestExpiry); err != nil {
			writeServiceError(w, err)
			return
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// listStoplist — блюда, которые нельзя приготовить (portions = 0).
func (a *API) listStoplist(w http.ResponseWriter, r *http.Request) {
	rows, err := a.pool.Query(r.Context(),
		`SELECT dish_id, name, portions FROM dish_availability WHERE portions = 0 ORDER BY name`)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	defer rows.Close()

	out := []models.StopDish{}
	for rows.Next() {
		var d models.StopDish
		if err := rows.Scan(&d.ID, &d.Name, &d.Portions); err != nil {
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

// listHotOffers — блюда, продажу которых стоит стимулировать, с объяснением причин.
// ?limit=N (по умолчанию 10, максимум 50).
func (a *API) listHotOffers(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offers, err := a.hotOffers.List(r.Context(), limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	if offers == nil {
		offers = []models.HotOffer{}
	}
	writeJSON(w, http.StatusOK, offers)
}

// listRestock — что пора заказывать: отсутствующие и заканчивающиеся продукты с рекомендацией.
func (a *API) listRestock(w http.ResponseWriter, r *http.Request) {
	items, err := a.restock.List(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// expiryReport — аналитика списаний просрочки: ?days=N (по умолчанию 30, максимум 365).
func (a *API) expiryReport(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	rep, err := a.expiry.Report(r.Context(), days)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rep)
}

// writeOffExpired — списать просроченные партии. Тело необязательно:
// {"batch_ids": [...]} — только указанные, пустое тело — все просроченные.
func (a *API) writeOffExpired(w http.ResponseWriter, r *http.Request) {
	var req models.ExpiryWriteOffRequest
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "некорректный JSON: "+err.Error())
		return
	}
	res, err := a.expiry.WriteOffExpired(r.Context(), req.BatchIDs)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
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
