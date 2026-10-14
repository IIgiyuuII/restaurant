package models

import "time"

// ExpiryWriteOffRequest — тело POST /api/writeoffs.
// Пустой список batch_ids = списать все просроченные партии.
type ExpiryWriteOffRequest struct {
	BatchIDs []string `json:"batch_ids"`
}

// ExpiredItem — просроченная партия, списанная со склада.
type ExpiredItem struct {
	BatchID   string  `json:"batch_id"`
	ProductID string  `json:"product_id"`
	Product   string  `json:"product"`
	Unit      string  `json:"unit"`
	Quantity  float64 `json:"quantity"`
}

// ExpiryWriteOffResult — ответ на POST /api/writeoffs.
type ExpiryWriteOffResult struct {
	WrittenOff int           `json:"written_off"` // сколько партий списано
	Items      []ExpiredItem `json:"items"`
}

// ExpiryStat — списания по одному продукту за период.
type ExpiryStat struct {
	ProductID string  `json:"product_id"`
	Name      string  `json:"name"`
	Unit      string  `json:"unit"`
	Batches   int     `json:"batches"`  // сколько партий списано
	Quantity  float64 `json:"quantity"` // сколько всего списано (в единицах продукта)
}

// ExpiryRecord — одна запись о списании просрочки (из журнала движений).
type ExpiryRecord struct {
	ID             int64     `json:"id"`
	CreatedAt      time.Time `json:"created_at"`
	ProductID      string    `json:"product_id"`
	Product        string    `json:"product"`
	Unit           string    `json:"unit"`
	Quantity       float64   `json:"quantity"`
	DeliveryNumber string    `json:"delivery_number"`
	ExpiresAt      time.Time `json:"expires_at"`
}

// ExpiryReport — аналитика списаний за период (GET /api/writeoffs).
type ExpiryReport struct {
	Days             int            `json:"days"`
	TotalBatches     int            `json:"total_batches"`
	ByProduct        []ExpiryStat   `json:"by_product"`
	Recent           []ExpiryRecord `json:"recent"`
	AutoCheckMinutes int            `json:"auto_check_minutes"` // 0 — автосписание выключено
}
