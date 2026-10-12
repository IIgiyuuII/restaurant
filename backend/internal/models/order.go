package models

import "time"

// OrderItemInput — позиция заказа: блюдо и количество порций.
type OrderItemInput struct {
	DishID   string `json:"dish_id"`
	Quantity int    `json:"quantity"`
}

// CreateOrderRequest — тело POST /api/orders.
type CreateOrderRequest struct {
	Items []OrderItemInput `json:"items"`
}

type OrderItemView struct {
	DishID   string `json:"dish_id"`
	Name     string `json:"name"`
	Quantity int    `json:"quantity"`
}

// WriteOff — сколько и из какой партии списано (виден порядок FEFO).
type WriteOff struct {
	ProductID string    `json:"product_id"`
	Product   string    `json:"product"`
	Unit      string    `json:"unit"`
	BatchID   string    `json:"batch_id"`
	Quantity  float64   `json:"quantity"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Shortage — нехватка ингредиента при отказе.
type Shortage struct {
	ProductID string  `json:"product_id"`
	Product   string  `json:"product"`
	Unit      string  `json:"unit"`
	Needed    float64 `json:"needed"`
	Available float64 `json:"available"`
}

// OrderResponse — результат обработки заказа (created или rejected).
type OrderResponse struct {
	ID        string          `json:"id"`
	Number    int64           `json:"number"`
	Status    string          `json:"status"` // created | rejected
	Reason    string          `json:"reason,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
	Items     []OrderItemView `json:"items"`
	WriteOffs []WriteOff      `json:"write_offs,omitempty"`
	Shortages []Shortage      `json:"shortages,omitempty"`
}

// DishAvailability — блюдо с количеством доступных порций (0 = стоп-лист).
type DishAvailability struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Price    float64 `json:"price"`
	Portions int     `json:"portions"`
}
