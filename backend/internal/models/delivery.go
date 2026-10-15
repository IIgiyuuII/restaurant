package models

import "time"

// DeliveryItemInput — одна позиция поставки (будет превращена в партию).
type DeliveryItemInput struct {
	ProductID      string  `json:"product_id"`
	Quantity       float64 `json:"quantity"`         // в базовых единицах продукта (г / мл / шт)
	ShelfLifeHours float64 `json:"shelf_life_hours"` // срок хранения от даты поставки, в часах
}

// CreateDeliveryRequest — тело POST /api/deliveries.
type CreateDeliveryRequest struct {
	Number       string              `json:"number"`        // необязательно: сгенерируется
	DeliveryDate *time.Time          `json:"delivery_date"` // необязательно: по умолчанию now()
	Items        []DeliveryItemInput `json:"items"`
}

// BatchView — созданная партия.
type BatchView struct {
	ID             string    `json:"id"`
	ProductID      string    `json:"product_id"`
	Product        string    `json:"product"`
	Unit           string    `json:"unit"`
	Quantity       float64   `json:"quantity"`
	ShelfLifeHours float64   `json:"shelf_life_hours"`
	ReceivedAt     time.Time `json:"received_at"`
	ExpiresAt      time.Time `json:"expires_at"`
}

// DeliveryResponse — ответ на создание поставки.
type DeliveryResponse struct {
	ID           string      `json:"id"`
	Number       string      `json:"number"`
	DeliveryDate time.Time   `json:"delivery_date"`
	CreatedAt    time.Time   `json:"created_at"`
	Batches      []BatchView `json:"batches"`
}
