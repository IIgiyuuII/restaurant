package models

// RestockItem — продукт, который пора заказывать: закончился или упал ниже минимального запаса.
type RestockItem struct {
	ProductID     string  `json:"product_id"`
	Name          string  `json:"name"`
	Unit          string  `json:"unit"`
	MinStock      float64 `json:"min_stock"`
	Quantity      float64 `json:"quantity"`           // живой остаток (без просроченных партий)
	Status        string  `json:"status"`             // out — нет совсем, low — ниже минимума
	Suggested     float64 `json:"suggested_quantity"` // сколько заказать, чтобы вернуться к запасу
	BlockedDishes int     `json:"blocked_dishes"`     // сколько блюд нельзя приготовить из-за этого продукта
}
