package services

import (
	"context"
	"testing"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

func restockByName(items []models.RestockItem) map[string]models.RestockItem {
	m := map[string]models.RestockItem{}
	for _, it := range items {
		m[it.Name] = it
	}
	return m
}

func TestRestock_EmptyIsNonNilSlice(t *testing.T) {
	d := testutil.New(t)
	items, err := NewRestockService(d.Pool).List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if items == nil || len(items) != 0 {
		t.Errorf("ожидали пустой не-nil слайс, получили %#v", items)
	}
}

func TestRestock_SelectionStatusesAndSuggestions(t *testing.T) {
	d := testutil.New(t)
	svc := NewRestockService(d.Pool)

	none := d.Product("Нет", "g", 100)                     // нет совсем → out
	few := d.Product("Мало", "g", 1000)                    // 400 < 1000 → low, докупить до 2000
	enough := d.Product("Норма", "g", 100)                 // ровно минимум → не показываем
	plenty := d.Product("Много", "g", 100)                 // с запасом → не показываем
	noMin := d.Product("БезМинимума", "g")                 // min = 0, остатка нет → out, докупать нечего (0)
	noMinHave := d.Product("БезМинимумаЕсть", "g")         // min = 0, остаток есть → не показываем
	onlyExpired := d.Product("ПросроченоТолько", "g", 100) // живых нет → out
	eggs := d.Product("Яйцо", "pcs", 30)                   // штуки: 5 < 30 → low

	_ = none
	d.Batch(few, 400, 48)
	d.Batch(enough, 100, 48)
	d.Batch(plenty, 500, 48)
	d.Batch(noMinHave, 50, 48)
	d.Batch(onlyExpired, 999, -1) // просроченная партия не считается
	d.Batch(eggs, 5, 48)
	_ = noMin

	items, err := svc.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	got := restockByName(items)

	for _, absent := range []string{"Норма", "Много", "БезМинимумаЕсть"} {
		if _, ok := got[absent]; ok {
			t.Errorf("%q не должен попадать в список пополнения", absent)
		}
	}
	if len(items) != 5 {
		t.Fatalf("в списке %d позиций, ожидали 5: %+v", len(items), items)
	}

	check := func(name, status string, qty, min, suggested float64) {
		t.Helper()
		it, ok := got[name]
		if !ok {
			t.Errorf("%q нет в списке", name)
			return
		}
		if it.Status != status || it.Quantity != qty || it.MinStock != min || it.Suggested != suggested {
			t.Errorf("%s: %+v; ожидали status=%s qty=%v min=%v suggested=%v", name, it, status, qty, min, suggested)
		}
		if it.ProductID == "" || it.Unit == "" {
			t.Errorf("%s: пустые id/unit: %+v", name, it)
		}
	}
	check("Нет", RestockOut, 0, 100, 200)
	check("Мало", RestockLow, 400, 1000, 1600)
	check("БезМинимума", RestockOut, 0, 0, 0)
	check("ПросроченоТолько", RestockOut, 0, 100, 200)
	check("Яйцо", RestockLow, 5, 30, 55)

	if got["Яйцо"].Unit != "pcs" {
		t.Errorf("единица яиц: %q", got["Яйцо"].Unit)
	}
}

func TestRestock_Ordering(t *testing.T) {
	d := testutil.New(t)
	d.Product("Нет", "g", 100)
	d.Product("ПросроченоТолько", "g", 100)
	d.Product("БезМинимума", "g")
	eggs := d.Product("Яйцо", "pcs", 30)
	few := d.Product("Мало", "g", 1000)
	d.Batch(eggs, 5, 48)  // 5/30 ≈ 0.17 — «пустее»
	d.Batch(few, 400, 48) // 400/1000 = 0.4

	items, err := NewRestockService(d.Pool).List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, it := range items {
		names = append(names, it.Name)
	}
	// Сначала отсутствующие (по алфавиту; с нулевым минимумом — в конце среди них),
	// затем заканчивающиеся — самые «пустые» первыми.
	want := []string{"Нет", "ПросроченоТолько", "БезМинимума", "Яйцо", "Мало"}
	if len(names) != len(want) {
		t.Fatalf("%v", names)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("порядок:\n got  %v\n want %v", names, want)
		}
	}
}

func TestRestock_BlockedDishes(t *testing.T) {
	d := testutil.New(t)
	svc := NewRestockService(d.Pool)
	cheese := d.Product("Мало", "g", 1000)
	bacon := d.Product("Нет", "g", 100)
	d.Batch(cheese, 400, 48)

	d.Dish("Нужен бекон", 100, testutil.Ing{Product: bacon, Qty: 10}) // заблокирован беконом
	d.Dish("Нужен бекон и сыр", 100, testutil.Ing{Product: bacon, Qty: 5}, testutil.Ing{Product: cheese, Qty: 50})
	inactive := d.Dish("Снятое", 100, testutil.Ing{Product: bacon, Qty: 10})
	d.Exec(`UPDATE dishes SET is_active = false WHERE id = $1::uuid`, inactive) // снятые не считаем
	d.Dish("Сыр много", 100, testutil.Ing{Product: cheese, Qty: 500})           // 400 < 500 → заблокирован сыром
	d.Dish("Сыр мало", 100, testutil.Ing{Product: cheese, Qty: 300})            // 400 ≥ 300 → не заблокирован

	items, err := svc.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	got := restockByName(items)
	if got["Нет"].BlockedDishes != 2 {
		t.Errorf("бекон блокирует %d блюд, ожидали 2 (активные)", got["Нет"].BlockedDishes)
	}
	if got["Мало"].BlockedDishes != 1 {
		t.Errorf("сыр блокирует %d блюд, ожидали 1", got["Мало"].BlockedDishes)
	}
}

func TestRestock_UpdatesAfterDeliveryAndOrders(t *testing.T) {
	d := testutil.New(t)
	svc := NewRestockService(d.Pool)
	orders := NewOrderService(d.Pool)
	flour := d.Product("Мука", "g", 500)
	pancake := d.Dish("Блин", 100, testutil.Ing{Product: flour, Qty: 100})

	items, _ := svc.List(context.Background())
	if len(items) != 1 || items[0].Status != RestockOut || items[0].BlockedDishes != 1 {
		t.Fatalf("без запаса: %+v", items)
	}

	d.Batch(flour, 1000, 48)
	if items, _ = svc.List(context.Background()); len(items) != 0 {
		t.Fatalf("после поставки пополнение не нужно: %+v", items)
	}

	// Продали 7 блинов → осталось 300 < 500 → low.
	if r, err := orders.Create(context.Background(), models.CreateOrderRequest{Items: []models.OrderItemInput{{DishID: pancake, Quantity: 7}}}); err != nil || r.Status != StatusCreated {
		t.Fatalf("%v %+v", err, r)
	}
	items, _ = svc.List(context.Background())
	if len(items) != 1 || items[0].Status != RestockLow || items[0].Quantity != 300 || items[0].Suggested != 700 {
		t.Fatalf("после продаж: %+v", items)
	}
}

func TestRestock_ClosedPoolReturnsError(t *testing.T) {
	d := testutil.New(t)
	svc := NewRestockService(d.Pool)
	d.Pool.Close()
	if _, err := svc.List(context.Background()); err == nil {
		t.Fatal("ожидали ошибку")
	}
}

// Если из-за продукта нельзя приготовить блюдо, статус «out» — даже когда остаток > 0.
func TestRestock_BlockedDishMakesStatusOutEvenWithStock(t *testing.T) {
	d := testutil.New(t)
	svc := NewRestockService(d.Pool)

	cheese := d.Product("Сыр", "g", 1000)
	ham := d.Product("Ветчина", "g", 1000)
	d.Batch(cheese, 400, 48)
	d.Batch(ham, 400, 48)
	d.Dish("Нужно 500 г сыра", 100, testutil.Ing{Product: cheese, Qty: 500}) // 400 < 500 → блюдо заблокировано
	d.Dish("Нужно 300 г ветчины", 100, testutil.Ing{Product: ham, Qty: 300}) // 400 ≥ 300 → не заблокировано

	items, err := svc.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	got := restockByName(items)

	if c := got["Сыр"]; c.Status != RestockOut || c.Quantity != 400 || c.BlockedDishes != 1 {
		t.Errorf("сыр: %+v; ожидали out при остатке 400 и 1 заблокированном блюде", c)
	}
	if h := got["Ветчина"]; h.Status != RestockLow || h.Quantity != 400 || h.BlockedDishes != 0 {
		t.Errorf("ветчина: %+v; ожидали low", h)
	}
}
