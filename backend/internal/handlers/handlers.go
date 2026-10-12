package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

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
