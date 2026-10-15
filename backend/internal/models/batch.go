package models

import "time"

// BatchStock — живая партия на складе (для экрана «остатки по партиям»).
type BatchStock struct {
	ID             string    `json:"id"`
	ProductID      string    `json:"product_id"`
	Product        string    `json:"product"`
	Unit           string    `json:"unit"`
	DeliveryNumber string    `json:"delivery_number"`
	InitialQty     float64   `json:"initial_quantity"`
	RemainingQty   float64   `json:"remaining_quantity"`
	ReceivedAt     time.Time `json:"received_at"`
	ExpiresAt      time.Time `json:"expires_at"`
	HoursLeft      float64   `json:"hours_left"` // отрицательное = уже просрочена
	Expired        bool      `json:"expired"`    // срок вышел, но партия ещё не списана
}

// OrderHistoryItem — позиция в истории заказов.
type OrderHistoryItem struct {
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
}

// OrderHistory — заказ в списке последних заказов.
type OrderHistory struct {
	ID               string             `json:"id"`
	Number           int64              `json:"number"`
	Status           string             `json:"status"`
	Reason           string             `json:"reason,omitempty"`
	CreatedAt        time.Time          `json:"created_at"`
	Revenue          float64            `json:"revenue"`
	RevenueEstimated bool               `json:"revenue_estimated"`
	Items            []OrderHistoryItem `json:"items"`
}
