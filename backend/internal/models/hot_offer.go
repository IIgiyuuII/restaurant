package models

import "time"

// HotReason — одна причина рекомендации: «горящая» партия ингредиента.
type HotReason struct {
	ProductID   string    `json:"product_id"`
	Product     string    `json:"product"`
	Unit        string    `json:"unit"`
	BatchID     string    `json:"batch_id"`
	Quantity    float64   `json:"quantity"` // остаток партии
	ExpiresAt   time.Time `json:"expires_at"`
	HoursLeft   float64   `json:"hours_left"`
	Urgency     float64   `json:"urgency"`      // 0..1, выше — срочнее
	CoveragePct float64   `json:"coverage_pct"` // какую часть партии блюдо способно израсходовать
	Points      float64   `json:"points"`       // вклад в приоритет блюда
	Text        string    `json:"text"`         // готовое объяснение для интерфейса
}

// HotOffer — блюдо, продажу которого стоит стимулировать.
type HotOffer struct {
	DishID    string      `json:"dish_id"`
	Name      string      `json:"name"`
	Price     float64     `json:"price"`
	Portions  int         `json:"portions"`
	Score     float64     `json:"score"`
	Level     string      `json:"level"`      // critical | high | medium
	HoursLeft float64     `json:"hours_left"` // до ближайшей «горящей» партии
	Summary   string      `json:"summary"`
	Reasons   []HotReason `json:"reasons"`
}
