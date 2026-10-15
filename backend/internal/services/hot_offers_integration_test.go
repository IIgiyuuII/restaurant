package services

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

func offerNames(offers []models.HotOffer) []string {
	out := make([]string, len(offers))
	for i, o := range offers {
		out[i] = o.Name
	}
	return out
}

func TestHotOffers_DB_Scenario(t *testing.T) {
	d := testutil.New(t)
	svc := NewHotOffersService(d.Pool)

	milk := d.Product("Молоко", "ml")
	flour := d.Product("Мука", "g")
	beans := d.Product("Зёрна", "g")

	omelet := d.Dish("Омлет", 250, testutil.Ing{Product: milk, Qty: 50})
	d.Dish("Блины", 200, testutil.Ing{Product: flour, Qty: 100})                                      // мука не «горит»
	d.Dish("Латте", 300, testutil.Ing{Product: milk, Qty: 50}, testutil.Ing{Product: beans, Qty: 10}) // зёрен нет → стоп-лист
	inactive := d.Dish("Снятое", 100, testutil.Ing{Product: milk, Qty: 50})
	d.Exec(`UPDATE dishes SET is_active = false WHERE id = $1::uuid`, inactive)

	milkBatch := d.Batch(milk, 500, 5) // истекает через 5 ч: «горит»
	d.Batch(flour, 5000, 200)          // за горизонтом 72 ч

	offers, err := svc.List(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if got := offerNames(offers); len(got) != 1 || got[0] != "Омлет" {
		t.Fatalf("ожидали только Омлет, получили %v", got)
	}

	o := offers[0]
	if o.DishID != omelet || o.Price != 250 || o.Portions != 10 {
		t.Errorf("поля блюда: %+v", o)
	}
	// Омлет может израсходовать всю партию (10 порций × 50 мл = 500 мл); блюдо одно → доля 100%.
	// Балл ≈ 0.5^(5/24) ≈ 0.87.
	if o.Score < 0.85 || o.Score > 0.88 {
		t.Errorf("score = %v, ожидали ≈ 0.87", o.Score)
	}
	if o.Level != levelCritical {
		t.Errorf("level = %s, ожидали critical (< 12 ч)", o.Level)
	}
	if len(o.Reasons) != 1 || o.Reasons[0].BatchID != milkBatch || o.Reasons[0].CoveragePct != 100 {
		t.Errorf("reasons: %+v", o.Reasons)
	}
	if !strings.Contains(o.Summary, "Молоко") || o.Summary != o.Reasons[0].Text {
		t.Errorf("summary: %q", o.Summary)
	}
}

func TestHotOffers_DB_ShareAndCoverage(t *testing.T) {
	// Две пиццы делят партию теста: баллы делятся поровну; ограниченный сыр режет порции.
	d := testutil.New(t)
	svc := NewHotOffersService(d.Pool)
	dough := d.Product("Тесто", "g")
	cheese := d.Product("Сыр", "g")
	d.Dish("Маргарита", 550, testutil.Ing{Product: dough, Qty: 200}, testutil.Ing{Product: cheese, Qty: 150})
	d.Dish("Пепперони", 650, testutil.Ing{Product: dough, Qty: 200}, testutil.Ing{Product: cheese, Qty: 150})
	d.Batch(dough, 3000, 17)
	d.Batch(cheese, 600, 100) // 4 порции на пиццу, срок за горизонтом

	offers, err := NewHotOffersService(d.Pool).List(context.Background(), 10)
	_ = svc
	if err != nil {
		t.Fatal(err)
	}
	if len(offers) != 2 {
		t.Fatalf("ожидали 2 блюда: %v", offerNames(offers))
	}
	// Порций по 4 → пицца способна израсходовать 800 г из 3000 (27%).
	for _, o := range offers {
		if o.Portions != 4 {
			t.Errorf("%s: порций %d, ожидали 4", o.Name, o.Portions)
		}
		if len(o.Reasons) != 1 || o.Reasons[0].CoveragePct != 27 {
			t.Errorf("%s: reasons %+v, ожидали покрытие 27%%", o.Name, o.Reasons)
		}
	}
	if offers[0].Score != offers[1].Score {
		t.Errorf("равные рецепты → равные баллы: %v и %v", offers[0].Score, offers[1].Score)
	}
}

func TestHotOffers_DB_ReactsToOrdersAndDeliveries(t *testing.T) {
	d := testutil.New(t)
	svc := NewHotOffersService(d.Pool)
	orders := NewOrderService(d.Pool)
	milk := d.Product("Молоко", "ml")
	omelet := d.Dish("Омлет", 250, testutil.Ing{Product: milk, Qty: 50})
	d.Batch(milk, 500, 5)

	if offers, _ := svc.List(context.Background(), 10); len(offers) != 1 {
		t.Fatalf("до заказа ожидали 1 предложение, получили %d", len(offers))
	}

	// Продали всё молоко — предлагать больше нечего.
	if r, err := orders.Create(context.Background(), models.CreateOrderRequest{Items: []models.OrderItemInput{{DishID: omelet, Quantity: 10}}}); err != nil || r.Status != StatusCreated {
		t.Fatalf("%v %+v", err, r)
	}
	if offers, err := svc.List(context.Background(), 10); err != nil || len(offers) != 0 {
		t.Fatalf("после продажи всей партии предложений быть не должно: %v %v", err, offerNames(offers))
	}

	// Пришла новая горящая партия — предложение вернулось.
	d.Batch(milk, 100, 3)
	offers, err := svc.List(context.Background(), 10)
	if err != nil || len(offers) != 1 || offers[0].Portions != 2 {
		t.Fatalf("после поставки: %v %+v", err, offers)
	}
}

func TestHotOffers_DB_ExpiredBatchesAreNotRecommended(t *testing.T) {
	d := testutil.New(t)
	milk := d.Product("Молоко", "ml")
	d.Dish("Омлет", 250, testutil.Ing{Product: milk, Qty: 50})
	d.Batch(milk, 500, -1) // уже просрочена

	offers, err := NewHotOffersService(d.Pool).List(context.Background(), 10)
	if err != nil || len(offers) != 0 {
		t.Fatalf("%v %v", err, offerNames(offers))
	}
}

func TestHotOffers_DB_LimitHandling(t *testing.T) {
	d := testutil.New(t)
	svc := NewHotOffersService(d.Pool)
	for i := 0; i < 12; i++ {
		p := d.Product(fmt.Sprintf("П%02d", i), "g")
		d.Dish(fmt.Sprintf("Блюдо%02d", i), 100, testutil.Ing{Product: p, Qty: 10})
		d.Batch(p, 100, float64(5+i))
	}
	cases := []struct {
		limit, want int
	}{
		{0, hotDefaultLimit},  // не задан → по умолчанию 10
		{-3, hotDefaultLimit}, // отрицательный → по умолчанию
		{5, 5},
		{12, 12},
		{1000, 12}, // выше максимума (50) → ограничено, но блюд всего 12
	}
	for _, c := range cases {
		offers, err := svc.List(context.Background(), c.limit)
		if err != nil {
			t.Fatal(err)
		}
		if len(offers) != c.want {
			t.Errorf("limit=%d: получили %d, ожидали %d", c.limit, len(offers), c.want)
		}
	}
	// Самое срочное (5 ч) — первое.
	offers, _ := svc.List(context.Background(), 3)
	if offers[0].Name != "Блюдо00" {
		t.Errorf("первым должно быть самое срочное блюдо, получили %s", offers[0].Name)
	}
}

func TestHotOffers_DB_ClosedPoolReturnsError(t *testing.T) {
	d := testutil.New(t)
	svc := NewHotOffersService(d.Pool)
	d.Pool.Close()
	if _, err := svc.List(context.Background(), 5); err == nil {
		t.Fatal("с закрытым пулом ожидали ошибку")
	}
}
