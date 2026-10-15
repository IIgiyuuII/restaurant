package services

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
)

// Параметры алгоритма горячих предложений.
const (
	// Партии, до конца срока которых больше горизонта, не считаются «горящими».
	hotHorizonHours = 72.0
	// За каждые hotHalfLifeHours срочность падает вдвое: 1.0 → 0.5 → 0.25 …
	hotHalfLifeHours = 24.0

	// Причины с вкладом меньше этого порога не показываются в объяснении.
	hotMinReasonPoints = 0.03

	hotDefaultLimit = 10
	hotMaxLimit     = 50

	levelCritical = "critical" // ближайшая партия истекает < 12 ч
	levelHigh     = "high"     // < 36 ч
	levelMedium   = "medium"
)

type HotOffersService struct{ pool *pgxpool.Pool }

func NewHotOffersService(pool *pgxpool.Pool) *HotOffersService {
	return &HotOffersService{pool: pool}
}

// hotIngredient — расход продукта на одну порцию (в тысячных долях единицы).
type hotIngredient struct {
	productID string
	milli     int64
}

// hotDish — доступное к заказу блюдо с составом.
type hotDish struct {
	id          string
	name        string
	price       float64
	portions    int
	ingredients []hotIngredient
}

// hotBatch — живая партия, срок которой подходит к концу.
type hotBatch struct {
	id        string
	productID string
	product   string
	unit      string
	milli     int64
	expires   time.Time
}

// List считает горячие предложения по текущему состоянию склада.
// Оба запроса идут в одной read-only транзакции (REPEATABLE READ), чтобы
// блюда и партии были из одного снимка данных даже при параллельных заказах.
func (s *HotOffersService) List(ctx context.Context, limit int) ([]models.HotOffer, error) {
	if limit <= 0 {
		limit = hotDefaultLimit
	}
	if limit > hotMaxLimit {
		limit = hotMaxLimit
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	dishes, err := loadAvailableDishes(ctx, tx)
	if err != nil {
		return nil, err
	}
	batches, err := loadAtRiskBatches(ctx, tx)
	if err != nil {
		return nil, err
	}
	return scoreHotOffers(dishes, batches, time.Now(), limit), nil
}

// loadAvailableDishes — блюда не из стоп-листа (portions > 0) вместе с рецептами.
func loadAvailableDishes(ctx context.Context, tx pgx.Tx) ([]hotDish, error) {
	rows, err := tx.Query(ctx,
		`SELECT da.dish_id, da.name, da.price::float8, da.portions,
		        di.product_id, (di.quantity * 1000)::bigint
		   FROM dish_availability da
		   JOIN dish_ingredients di ON di.dish_id = da.dish_id
		  WHERE da.portions > 0
		  ORDER BY da.name, di.product_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []hotDish
	idx := map[string]int{}
	for rows.Next() {
		var id, name, pid string
		var price float64
		var portions int
		var milli int64
		if err := rows.Scan(&id, &name, &price, &portions, &pid, &milli); err != nil {
			return nil, err
		}
		i, ok := idx[id]
		if !ok {
			out = append(out, hotDish{id: id, name: name, price: price, portions: portions})
			i = len(out) - 1
			idx[id] = i
		}
		out[i].ingredients = append(out[i].ingredients, hotIngredient{productID: pid, milli: milli})
	}
	return out, rows.Err()
}

// loadAtRiskBatches — живые партии, истекающие в пределах горизонта.
func loadAtRiskBatches(ctx context.Context, tx pgx.Tx) ([]hotBatch, error) {
	rows, err := tx.Query(ctx,
		`SELECT b.id, p.id, p.name, p.unit, (b.remaining_quantity * 1000)::bigint, b.expires_at
		   FROM batches b
		   JOIN products p ON p.id = b.product_id
		  WHERE b.status = 'active'
		    AND b.remaining_quantity > 0
		    AND b.expires_at > now()
		    AND b.expires_at <= now() + $1::float8 * interval '1 hour'
		  ORDER BY b.expires_at, b.id`, hotHorizonHours)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []hotBatch
	for rows.Next() {
		var b hotBatch
		if err := rows.Scan(&b.id, &b.productID, &b.product, &b.unit, &b.milli, &b.expires); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// urgency: 1.0 — истекает прямо сейчас, 0.5 — через hotHalfLifeHours, и т.д.
func urgency(hoursLeft float64) float64 {
	if hoursLeft <= 0 {
		return 1
	}
	return math.Pow(0.5, hoursLeft/hotHalfLifeHours)
}

// scoreHotOffers — чистая функция (без БД), поэтому легко тестируется.
//
// Приоритет блюда = Σ по всем «горящим» партиям его ингредиентов:
//
//		срочность(партии) × покрытие(блюдо, партия) × доля(блюдо, продукт)
//
//	  - срочность  = 0.5^(часов_до_конца / 24)
//	  - покрытие   = какую часть партии блюдо способно израсходовать:
//	    порции_блюда × расход_на_порцию, минус то, что «съедят» более ранние
//	    партии этого продукта (списание идёт по FEFO), делённое на остаток партии.
//	    Так учитываются количество на складе и расход в блюде.
//	  - доля       = расход продукта в этом блюде / суммарный расход среди всех
//	    доступных блюд с этим продуктом. Если продукт можно потратить в разных
//	    блюдах, баллы делятся между ними, а выигрывают те, кто расходует больше.
func scoreHotOffers(dishes []hotDish, batches []hotBatch, now time.Time, limit int) []models.HotOffer {
	// Партии по продуктам, раньше истекающие — первыми (порядок FEFO).
	byProduct := map[string][]hotBatch{}
	for _, b := range batches {
		byProduct[b.productID] = append(byProduct[b.productID], b)
	}
	for _, list := range byProduct {
		sort.SliceStable(list, func(i, j int) bool { return list[i].expires.Before(list[j].expires) })
	}

	// Суммарный расход продукта на порцию среди доступных блюд — знаменатель «доли».
	totalPerPortion := map[string]int64{}
	for _, d := range dishes {
		for _, ing := range d.ingredients {
			totalPerPortion[ing.productID] += ing.milli
		}
	}

	var offers []models.HotOffer
	for _, d := range dishes {
		if d.portions <= 0 {
			continue
		}
		var reasons []models.HotReason
		var score float64
		minHours := math.Inf(1)

		for _, ing := range d.ingredients {
			list := byProduct[ing.productID]
			if len(list) == 0 || totalPerPortion[ing.productID] == 0 || ing.milli == 0 {
				continue
			}
			absorb := ing.milli * int64(d.portions) // сколько продукта блюдо может «съесть» максимум
			share := float64(ing.milli) / float64(totalPerPortion[ing.productID])

			var before int64 // сколько уже заняли более ранние партии
			for _, b := range list {
				covered := clamp01(float64(absorb-before) / float64(b.milli))
				before += b.milli

				hours := b.expires.Sub(now).Hours()
				if covered == 0 || hours <= 0 {
					continue
				}
				u := urgency(hours)
				points := u * covered * share
				score += points
				minHours = math.Min(minHours, hours)

				reasons = append(reasons, models.HotReason{
					ProductID:   b.productID,
					Product:     b.product,
					Unit:        b.unit,
					BatchID:     b.id,
					Quantity:    float64(b.milli) / 1000,
					ExpiresAt:   b.expires.UTC(),
					HoursLeft:   round2(hours),
					Urgency:     round2(u),
					CoveragePct: math.Round(covered * 100),
					Points:      round2(points),
					Text:        reasonText(b, hours, covered),
				})
			}
		}
		if len(reasons) == 0 || score <= 0 {
			continue
		}

		sort.SliceStable(reasons, func(i, j int) bool { return reasons[i].Points > reasons[j].Points })
		// Незначительные причины (< hotMinReasonPoints) в баллы входят, но в
		// объяснении только мешают — оставляем главную и существенные.
		shown := reasons[:1]
		for _, r := range reasons[1:] {
			if r.Points >= hotMinReasonPoints {
				shown = append(shown, r)
			}
		}
		reasons = shown
		offers = append(offers, models.HotOffer{
			DishID:    d.id,
			Name:      d.name,
			Price:     d.price,
			Portions:  d.portions,
			Score:     round2(score),
			Level:     levelFor(minHours),
			HoursLeft: round2(minHours),
			Summary:   reasons[0].Text,
			Reasons:   reasons,
		})
	}

	sort.SliceStable(offers, func(i, j int) bool {
		if offers[i].Score != offers[j].Score {
			return offers[i].Score > offers[j].Score
		}
		if offers[i].HoursLeft != offers[j].HoursLeft {
			return offers[i].HoursLeft < offers[j].HoursLeft
		}
		return offers[i].Name < offers[j].Name
	})
	if limit > 0 && len(offers) > limit {
		offers = offers[:limit]
	}
	return offers
}

func levelFor(hours float64) string {
	switch {
	case hours < 12:
		return levelCritical
	case hours < 36:
		return levelHigh
	default:
		return levelMedium
	}
}

// reasonText: «Курица: партия 6000 г истекает через 17 ч — блюдо может израсходовать всю партию».
func reasonText(b hotBatch, hoursLeft, covered float64) string {
	tail := fmt.Sprintf("блюдо поможет израсходовать до %d%% партии", int(math.Round(covered*100)))
	if covered >= 0.995 {
		tail = "блюдо может израсходовать всю партию"
	}
	return fmt.Sprintf("%s: партия %s истекает через %s — %s",
		b.product, formatQty(float64(b.milli)/1000, b.unit), formatHoursLeft(hoursLeft), tail)
}

func formatHoursLeft(h float64) string {
	switch {
	case h < 1:
		return fmt.Sprintf("%d мин", max(1, int(h*60)))
	case h < 12:
		whole := int(h)
		return fmt.Sprintf("%d ч %d мин", whole, int((h-float64(whole))*60))
	case h < 48:
		return fmt.Sprintf("%d ч", int(h))
	default:
		return fmt.Sprintf("%d дн.", int(h/24))
	}
}

func clamp01(v float64) float64 {
	return math.Max(0, math.Min(1, v))
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
