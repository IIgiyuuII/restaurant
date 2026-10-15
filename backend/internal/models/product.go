package models

import "time"

// ProductStock — остаток продукта (только живые непросроченные партии).
type ProductStock struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Unit          string     `json:"unit"`
	Quantity      float64    `json:"quantity"`
	NearestExpiry *time.Time `json:"nearest_expiry"` // null, если живых партий нет
}

// StopDish — блюдо из стоп-листа (portions всегда 0).
type StopDish struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Portions int    `json:"portions"`
}
