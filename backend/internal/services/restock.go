package services

import (
	"context"
	"math"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
)

const (
	RestockOut = "out" // продукта нет совсем
	RestockLow = "low" // остаток ниже минимального запаса

	// Рекомендация: пополнить запас до двух минимальных норм.
	restockTargetFactor = 2.0
)

type RestockService struct{ pool *pgxpool.Pool }

func NewRestockService(pool *pgxpool.Pool) *RestockService {
	return &RestockService{pool: pool}
}

// List возвращает продукты, которые закончились или ниже min_stock, — сначала отсутствующие,
// затем самые «пустые». Остатки берутся из product_stock, то есть без просроченных партий.
//
// blocked_dishes — сколько активных блюд нельзя приготовить из-за этого продукта
// (его остатка не хватает даже на одну порцию).
func (s *RestockService) List(ctx context.Context) ([]models.RestockItem, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT ps.product_id, ps.name, ps.unit,
		        ps.min_stock::float8, ps.total_quantity::float8,
		        (SELECT count(*)
		           FROM dish_ingredients di
		           JOIN dishes d ON d.id = di.dish_id AND d.is_active
		          WHERE di.product_id = ps.product_id
		            AND ps.total_quantity < di.quantity)::int
		   FROM product_stock ps
		  WHERE ps.total_quantity < ps.min_stock OR ps.total_quantity = 0
		  ORDER BY (ps.total_quantity > 0),
		           ps.total_quantity / NULLIF(ps.min_stock, 0) NULLS LAST,
		           ps.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.RestockItem{}
	for rows.Next() {
		var it models.RestockItem
		if err := rows.Scan(&it.ProductID, &it.Name, &it.Unit, &it.MinStock, &it.Quantity, &it.BlockedDishes); err != nil {
			return nil, err
		}
		it.Status = restockStatus(it.Quantity, it.BlockedDishes)
		it.Suggested = suggestQuantity(it.Unit, it.MinStock, it.Quantity)
		out = append(out, it)
	}
	return out, rows.Err()
}

func restockStatus(quantity float64, blockedDishes int) string {
	if quantity <= 0 || blockedDishes > 0 {
		return RestockOut
	}
	return RestockLow
}

// suggestQuantity — сколько заказать, чтобы вернуться к запасу в две минимальные нормы.
// Округляем вверх до «круглой» партии: 100 г / 100 мл или 1 шт. Если докупать нечего — 0.
func suggestQuantity(unit string, minStock, quantity float64) float64 {
	need := minStock*restockTargetFactor - quantity
	if need <= 0 {
		return 0
	}
	step := 100.0
	if unit == "pcs" {
		step = 1
	}
	return math.Ceil(need/step) * step
}
