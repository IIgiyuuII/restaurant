package services

import (
	"context"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

// kitchen — мини-ресторан для тестов заказов.
//
//	Маргарита : сыр 150 г + тесто 200 г
//	Пепперони : сыр 150 г + тесто 200 г   (общие ингредиенты с Маргаритой)
//	Омлет     : молоко 50 мл + яйцо 3 шт
//	Карбонара : бекон 100 г + сыр 50 г + яйцо 2 шт
type kitchen struct {
	d                                        *testutil.DB
	svc                                      *OrderService
	cheese, dough, milk, eggs, bacon         string
	margherita, pepperoni, omelet, carbonara string
}

func newKitchen(t *testing.T) *kitchen {
	t.Helper()
	d := testutil.New(t)
	k := &kitchen{d: d, svc: NewOrderService(d.Pool)}
	k.cheese = d.Product("Сыр", "g")
	k.dough = d.Product("Тесто", "g")
	k.milk = d.Product("Молоко", "ml")
	k.eggs = d.Product("Яйцо", "pcs")
	k.bacon = d.Product("Бекон", "g")
	k.margherita = d.Dish("Маргарита", 550, testutil.Ing{Product: k.cheese, Qty: 150}, testutil.Ing{Product: k.dough, Qty: 200})
	k.pepperoni = d.Dish("Пепперони", 650, testutil.Ing{Product: k.cheese, Qty: 150}, testutil.Ing{Product: k.dough, Qty: 200})
	k.omelet = d.Dish("Омлет", 250, testutil.Ing{Product: k.milk, Qty: 50}, testutil.Ing{Product: k.eggs, Qty: 3})
	k.carbonara = d.Dish("Карбонара", 490,
		testutil.Ing{Product: k.bacon, Qty: 100}, testutil.Ing{Product: k.cheese, Qty: 50}, testutil.Ing{Product: k.eggs, Qty: 2})
	return k
}

func (k *kitchen) order(items ...models.OrderItemInput) (*models.OrderResponse, error) {
	return k.svc.Create(context.Background(), models.CreateOrderRequest{Items: items})
}

func line(dish string, qty int) models.OrderItemInput {
	return models.OrderItemInput{DishID: dish, Quantity: qty}
}

// ---------------- Успешный заказ ----------------

func TestOrder_Success(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.cheese, 1000, 48)
	k.d.Batch(k.dough, 1000, 48)

	before := time.Now().Add(-time.Second)
	resp, err := k.order(line(k.margherita, 2))
	if err != nil {
		t.Fatal(err)
	}

	if resp.Status != StatusCreated || resp.ID == "" || resp.Number <= 0 || resp.Reason != "" || len(resp.Shortages) != 0 {
		t.Errorf("ответ: %+v", resp)
	}
	if resp.CreatedAt.Before(before) || resp.CreatedAt.After(time.Now().Add(time.Second)) {
		t.Errorf("created_at = %v", resp.CreatedAt)
	}
	if len(resp.Items) != 1 || resp.Items[0].Name != "Маргарита" || resp.Items[0].Quantity != 2 || resp.Items[0].DishID != k.margherita {
		t.Errorf("items: %+v", resp.Items)
	}

	// Остатки: сыр 1000 − 300, тесто 1000 − 400.
	if got := k.d.Stock(k.cheese); got != 700 {
		t.Errorf("сыра осталось %v, ожидали 700", got)
	}
	if got := k.d.Stock(k.dough); got != 600 {
		t.Errorf("теста осталось %v, ожидали 600", got)
	}

	// Заказ и позиции сохранены.
	if k.d.Count("orders", "status = 'created' AND reason IS NULL") != 1 || k.d.Count("order_items") != 1 {
		t.Error("заказ/позиции не сохранены")
	}
	// Журнал: списания отрицательные, привязаны к заказу.
	if n := k.d.Count("stock_movements", "type = 'order' AND delta < 0 AND order_id IS NOT NULL"); n != 2 {
		t.Errorf("записей order: %d, ожидали 2", n)
	}
	if got := k.d.MovementSum("order"); got != -700 {
		t.Errorf("сумма списаний %v, ожидали -700", got)
	}
	// write_offs: по одному на продукт, в сумме 300 г сыра и 400 г теста.
	got := map[string]float64{}
	for _, w := range resp.WriteOffs {
		got[w.Product] += w.Quantity
		if w.Unit != "g" || w.BatchID == "" || w.ProductID == "" {
			t.Errorf("write_off: %+v", w)
		}
	}
	if got["Сыр"] != 300 || got["Тесто"] != 400 {
		t.Errorf("write_offs: %v", got)
	}
	k.d.AssertInvariants()
}

func TestOrder_ReducesPortionsInView(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.milk, 600, 48)
	k.d.Batch(k.eggs, 36, 48)
	if got := k.d.Portions(k.omelet); got != 12 {
		t.Fatalf("исходно порций %d, ожидали 12", got)
	}
	if _, err := k.order(line(k.omelet, 5)); err != nil {
		t.Fatal(err)
	}
	if got := k.d.Portions(k.omelet); got != 7 {
		t.Errorf("после заказа порций %d, ожидали 7", got)
	}
}

func TestOrder_ExactConsumptionPutsDishOnStoplist(t *testing.T) {
	k := newKitchen(t)
	b1 := k.d.Batch(k.milk, 150, 48)
	b2 := k.d.Batch(k.eggs, 9, 48)

	resp, err := k.order(line(k.omelet, 3)) // молоко 150, яйцо 9 — ровно всё
	if err != nil || resp.Status != StatusCreated {
		t.Fatalf("%v %+v", err, resp)
	}
	for _, b := range []string{b1, b2} {
		if got := k.d.BatchStatus(b); got != "depleted" {
			t.Errorf("партия %s: статус %q, ожидали depleted", b, got)
		}
		if got := k.d.Remaining(b); got != 0 {
			t.Errorf("партия %s: остаток %v", b, got)
		}
	}
	if got := k.d.Portions(k.omelet); got != 0 {
		t.Errorf("блюдо должно оказаться в стоп-листе, порций: %d", got)
	}
	k.d.AssertInvariants()
}

func TestOrder_MaxPortionsPerDish(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.milk, 5000, 48)
	k.d.Batch(k.eggs, 300, 48)
	resp, err := k.order(line(k.omelet, maxDishPortions))
	if err != nil || resp.Status != StatusCreated {
		t.Fatalf("%v %+v", err, resp)
	}
	if k.d.Stock(k.milk) != 0 || k.d.Stock(k.eggs) != 0 {
		t.Error("весь запас должен быть списан")
	}
}

func TestOrder_NumbersIncrease(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.milk, 1000, 48)
	k.d.Batch(k.eggs, 100, 48)
	a, err1 := k.order(line(k.omelet, 1))
	b, err2 := k.order(line(k.omelet, 1))
	if err1 != nil || err2 != nil {
		t.Fatal(err1, err2)
	}
	if b.Number <= a.Number {
		t.Errorf("номера заказов не растут: %d, %d", a.Number, b.Number)
	}
}

func TestOrder_DuplicateLinesAreMerged(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.cheese, 1000, 48)
	k.d.Batch(k.dough, 1000, 48)

	resp, err := k.order(line(k.margherita, 1), line(k.margherita, 2))
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Items) != 1 || resp.Items[0].Quantity != 3 {
		t.Errorf("items: %+v", resp.Items)
	}
	if k.d.Count("order_items") != 1 || k.d.Int(`SELECT quantity FROM order_items`) != 3 {
		t.Error("в БД должна быть одна позиция × 3")
	}
	if got := k.d.Stock(k.cheese); got != 550 {
		t.Errorf("сыра осталось %v, ожидали 550 (3 × 150 списано)", got)
	}
}

func TestOrder_ItemsKeepRequestOrder(t *testing.T) {
	k := newKitchen(t)
	for _, p := range []string{k.cheese, k.dough, k.milk, k.eggs} {
		k.d.Batch(p, 10000, 48)
	}
	resp, err := k.order(line(k.omelet, 1), line(k.margherita, 1))
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Items) != 2 || resp.Items[0].Name != "Омлет" || resp.Items[1].Name != "Маргарита" {
		t.Errorf("порядок позиций нарушен: %+v", resp.Items)
	}
}

// ---------------- FEFO ----------------

func TestOrder_FEFO_EarliestExpiryFirst_SplitsAcrossBatches(t *testing.T) {
	k := newKitchen(t)
	// Создаём намеренно «не по порядку»: порядок вставки не должен влиять на FEFO.
	late := k.d.Batch(k.cheese, 800, 100)
	early := k.d.Batch(k.cheese, 200, 5)
	mid := k.d.Batch(k.cheese, 300, 50)
	k.d.Batch(k.dough, 1000, 48)

	resp, err := k.order(line(k.margherita, 3)) // сыра нужно 450 г
	if err != nil || resp.Status != StatusCreated {
		t.Fatalf("%v %+v", err, resp)
	}

	if got := k.d.Remaining(early); got != 0 || k.d.BatchStatus(early) != "depleted" {
		t.Errorf("ранняя партия: остаток %v, статус %q — ожидали 0 / depleted", got, k.d.BatchStatus(early))
	}
	if got := k.d.Remaining(mid); got != 50 || k.d.BatchStatus(mid) != "active" {
		t.Errorf("средняя партия: остаток %v, статус %q — ожидали 50 / active", got, k.d.BatchStatus(mid))
	}
	if got := k.d.Remaining(late); got != 800 {
		t.Errorf("поздняя партия не должна затрагиваться: %v", got)
	}

	// В ответе списания по сыру идут от ранней партии к поздней.
	var cheese []models.WriteOff
	for _, w := range resp.WriteOffs {
		if w.Product == "Сыр" {
			cheese = append(cheese, w)
		}
	}
	if len(cheese) != 2 {
		t.Fatalf("списаний по сыру %d, ожидали 2: %+v", len(cheese), cheese)
	}
	if cheese[0].BatchID != early || cheese[0].Quantity != 200 || cheese[1].BatchID != mid || cheese[1].Quantity != 250 {
		t.Errorf("списания: %+v", cheese)
	}
	if !cheese[0].ExpiresAt.Before(cheese[1].ExpiresAt) {
		t.Error("списания должны идти по возрастанию срока годности")
	}
	k.d.AssertInvariants()
}

func TestOrder_FEFO_SecondOrderContinuesWhereFirstStopped(t *testing.T) {
	k := newKitchen(t)
	early := k.d.Batch(k.cheese, 200, 5)
	late := k.d.Batch(k.cheese, 1000, 100)
	k.d.Batch(k.dough, 5000, 48)

	for i := 0; i < 2; i++ { // 2 × 150 = 300 г: 200 из ранней и 100 из поздней
		if r, err := k.order(line(k.margherita, 1)); err != nil || r.Status != StatusCreated {
			t.Fatalf("заказ %d: %v %+v", i, err, r)
		}
	}
	if got := k.d.Remaining(early); got != 0 {
		t.Errorf("ранняя: %v", got)
	}
	if got := k.d.Remaining(late); got != 900 {
		t.Errorf("поздняя: %v, ожидали 900", got)
	}
	k.d.AssertInvariants()
}

func TestOrder_IgnoresExpiredDepletedAndWrittenOffBatches(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.cheese, 1000, -1) // истёк по времени
	written := k.d.Batch(k.cheese, 1000, 10)
	k.d.SetBatchStatus(written, "expired") // уже списана
	empty := k.d.Batch(k.cheese, 1000, 10)
	k.d.SetBatchStatus(empty, "depleted")
	live := k.d.Batch(k.cheese, 100, 10)
	k.d.Batch(k.dough, 1000, 48)

	resp, err := k.order(line(k.margherita, 1)) // нужно 150 г, живых только 100
	if err != nil {
		t.Fatal(err)
	}
	if resp.Status != StatusRejected {
		t.Fatalf("заказ должен быть отклонён, статус %q", resp.Status)
	}
	if len(resp.Shortages) != 1 || resp.Shortages[0].Available != 100 {
		t.Errorf("shortages: %+v", resp.Shortages)
	}

	// Добавили ещё живой сыр — теперь проходит и трогает только живые партии.
	more := k.d.Batch(k.cheese, 100, 20)
	resp, err = k.order(line(k.margherita, 1))
	if err != nil || resp.Status != StatusCreated {
		t.Fatalf("%v %+v", err, resp)
	}
	if k.d.Remaining(live) != 0 || k.d.Remaining(more) != 50 {
		t.Errorf("остатки живых партий: %v / %v", k.d.Remaining(live), k.d.Remaining(more))
	}
}

// ---------------- Отказ ----------------

func TestOrder_Rejected_ReasonAndNoSideEffects(t *testing.T) {
	k := newKitchen(t)
	cheese := k.d.Batch(k.cheese, 200, 48)
	k.d.Batch(k.dough, 1000, 48)

	resp, err := k.order(line(k.margherita, 2)) // сыра нужно 300 г, есть 200
	if err != nil {
		t.Fatal(err)
	}
	if resp.Status != StatusRejected {
		t.Fatalf("статус %q", resp.Status)
	}
	if want := "Не хватает: Сыр — нужно 300 г, есть 200 г"; resp.Reason != want {
		t.Errorf("reason:\n got  %q\n want %q", resp.Reason, want)
	}
	if len(resp.Shortages) != 1 {
		t.Fatalf("shortages: %+v", resp.Shortages)
	}
	s := resp.Shortages[0]
	if s.Product != "Сыр" || s.Unit != "g" || s.Needed != 300 || s.Available != 200 {
		t.Errorf("shortage: %+v", s)
	}
	if len(resp.WriteOffs) != 0 || resp.ID == "" || resp.Number <= 0 {
		t.Errorf("ответ отказа: %+v", resp)
	}

	// Склад не тронут, журнал без списаний.
	if k.d.Remaining(cheese) != 200 || k.d.Stock(k.dough) != 1000 {
		t.Error("склад изменился при отказе")
	}
	if k.d.Count("stock_movements", "type = 'order'") != 0 {
		t.Error("при отказе нельзя писать списания")
	}
	// Но сам отказ записан с причиной и позициями.
	if k.d.Count("orders", "status = 'rejected' AND reason IS NOT NULL") != 1 || k.d.Count("order_items") != 1 {
		t.Error("отклонённый заказ должен быть сохранён с позициями")
	}
	k.d.AssertInvariants()
}

func TestOrder_Rejected_AllShortagesSortedByName(t *testing.T) {
	k := newKitchen(t) // на складе пусто
	resp, err := k.order(line(k.margherita, 1))
	if err != nil {
		t.Fatal(err)
	}
	want := "Не хватает: Сыр — нужно 150 г, есть 0 г; Тесто — нужно 200 г, есть 0 г"
	if resp.Status != StatusRejected || resp.Reason != want {
		t.Errorf("status=%q reason=%q\nwant %q", resp.Status, resp.Reason, want)
	}
	names := []string{}
	for _, s := range resp.Shortages {
		names = append(names, s.Product)
	}
	if !sort.StringsAreSorted(names) || len(names) != 2 {
		t.Errorf("нехватки должны идти по алфавиту: %v", names)
	}
}

func TestOrder_Rejected_UnitsInReason(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.milk, 20, 48)
	k.d.Batch(k.eggs, 1, 48)
	resp, err := k.order(line(k.omelet, 1))
	if err != nil {
		t.Fatal(err)
	}
	want := "Не хватает: Молоко — нужно 50 мл, есть 20 мл; Яйцо — нужно 3 шт, есть 1 шт"
	if resp.Reason != want {
		t.Errorf("reason:\n got  %q\n want %q", resp.Reason, want)
	}
}

func TestOrder_SharedIngredientIsAggregatedAcrossDishes(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.cheese, 400, 48)
	k.d.Batch(k.dough, 5000, 48)

	// Каждое блюдо по отдельности укладывается в 400 г сыра, а вместе — нет.
	resp, err := k.order(line(k.margherita, 2), line(k.pepperoni, 1)) // 300 + 150 = 450 > 400
	if err != nil {
		t.Fatal(err)
	}
	if resp.Status != StatusRejected {
		t.Fatalf("суммарная потребность превышает остаток — ждали отказ, статус %q", resp.Status)
	}
	if len(resp.Shortages) != 1 || resp.Shortages[0].Needed != 450 || resp.Shortages[0].Available != 400 {
		t.Errorf("shortages: %+v", resp.Shortages)
	}
	if k.d.Stock(k.cheese) != 400 {
		t.Error("склад не должен измениться")
	}

	// А в пределах остатка (150 + 150 = 300 ≤ 400) — проходит.
	resp, err = k.order(line(k.margherita, 1), line(k.pepperoni, 1))
	if err != nil || resp.Status != StatusCreated {
		t.Fatalf("%v %+v", err, resp)
	}
	if got := k.d.Stock(k.cheese); got != 100 {
		t.Errorf("сыра осталось %v, ожидали 100", got)
	}
	// Списание по сыру — одно агрегированное, не два по блюдам.
	cheeseWriteOffs := 0
	for _, w := range resp.WriteOffs {
		if w.Product == "Сыр" {
			cheeseWriteOffs++
		}
	}
	if cheeseWriteOffs != 1 {
		t.Errorf("списаний по сыру %d, ожидали 1 (из одной партии)", cheeseWriteOffs)
	}
}

func TestOrder_PartiallyAvailableOrderIsRejectedEntirely(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.milk, 1000, 48)
	k.d.Batch(k.eggs, 100, 48) // омлет возможен
	// карбонара невозможна: бекона нет

	resp, err := k.order(line(k.omelet, 1), line(k.carbonara, 1))
	if err != nil || resp.Status != StatusRejected {
		t.Fatalf("%v %+v", err, resp)
	}
	if k.d.Stock(k.milk) != 1000 || k.d.Stock(k.eggs) != 100 {
		t.Error("доступное блюдо не должно быть частично списано")
	}
	if k.d.Count("stock_movements", "type='order'") != 0 {
		t.Error("списаний быть не должно")
	}
}

// ---------------- Валидация ----------------

func TestOrder_ValidationErrorsLeaveNoTraces(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.cheese, 1000, 48)
	k.d.Batch(k.dough, 1000, 48)

	inactive := k.d.Dish("Снятое", 100, testutil.Ing{Product: k.cheese, Qty: 10})
	k.d.Exec(`UPDATE dishes SET is_active = false WHERE id = $1::uuid`, inactive)
	noRecipe := k.d.Dish("Без рецепта", 100)

	cases := []struct {
		name  string
		items []models.OrderItemInput
		part  string
	}{
		{"пустой заказ", nil, "пуст"},
		{"неизвестное блюдо", []models.OrderItemInput{line("00000000-0000-0000-0000-000000000000", 1)}, "не найдено"},
		{"невалидный uuid", []models.OrderItemInput{line("абракадабра", 1)}, "не найдено"},
		{"снятое с продажи", []models.OrderItemInput{line(inactive, 1)}, "снято с продажи"},
		{"блюдо без состава", []models.OrderItemInput{line(noRecipe, 1)}, "не задан состав"},
		{"нулевое количество", []models.OrderItemInput{line(k.margherita, 0)}, "quantity"},
		{"корректное блюдо + неизвестное", []models.OrderItemInput{line(k.margherita, 1), line("00000000-0000-0000-0000-000000000000", 1)}, "не найдено"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			resp, err := k.order(c.items...)
			if resp != nil {
				t.Fatalf("при ошибке ответа быть не должно: %+v", resp)
			}
			ve := asValidation(t, err)
			if !strings.Contains(ve.Msg, c.part) {
				t.Errorf("сообщение %q не содержит %q", ve.Msg, c.part)
			}
			if k.d.Count("orders") != 0 || k.d.Count("order_items") != 0 {
				t.Error("ошибка валидации не должна оставлять заказов")
			}
			if k.d.Stock(k.cheese) != 1000 || k.d.Stock(k.dough) != 1000 {
				t.Error("склад не должен изменяться")
			}
		})
	}
}

func TestOrder_UppercaseDishIDIsAccepted(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.milk, 1000, 48)
	k.d.Batch(k.eggs, 100, 48)
	resp, err := k.order(line(strings.ToUpper(k.omelet), 1))
	if err != nil || resp.Status != StatusCreated {
		t.Fatalf("%v %+v", err, resp)
	}
}

func TestOrder_CancelledContext(t *testing.T) {
	k := newKitchen(t)
	k.d.Batch(k.milk, 1000, 48)
	k.d.Batch(k.eggs, 100, 48)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	resp, err := k.svc.Create(ctx, models.CreateOrderRequest{Items: []models.OrderItemInput{line(k.omelet, 1)}})
	if err == nil || resp != nil {
		t.Fatalf("с отменённым контекстом ждали ошибку: %v %+v", err, resp)
	}
	if _, isValidation := err.(*ValidationError); isValidation {
		t.Errorf("это не ошибка валидации: %v", err)
	}
	if k.d.Count("orders") != 0 || k.d.Stock(k.milk) != 1000 {
		t.Error("ничего не должно быть записано")
	}
}

// ---------------- Конкурентность ----------------

type orderResult struct {
	resp *models.OrderResponse
	err  error
}

// runConcurrently запускает n заказов одновременно (старт по общему сигналу,
// чтобы максимально усилить конкуренцию за одни и те же строки).
func runConcurrently(n int, items func(i int) []models.OrderItemInput, svc *OrderService) []orderResult {
	out := make([]orderResult, n)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			resp, err := svc.Create(context.Background(), models.CreateOrderRequest{Items: items(i)})
			out[i] = orderResult{resp, err}
		}(i)
	}
	close(start)
	wg.Wait()
	return out
}

func TestOrder_Concurrent_NoOversell(t *testing.T) {
	d := testutil.New(t)
	svc := NewOrderService(d.Pool)
	meat := d.Product("Мясо", "g")
	cutlet := d.Dish("Котлета", 300, testutil.Ing{Product: meat, Qty: 100})
	b1 := d.Batch(meat, 400, 10)
	b2 := d.Batch(meat, 300, 20)
	b3 := d.Batch(meat, 300, 30) // всего 1000 г = 10 порций

	const n = 30
	results := runConcurrently(n, func(int) []models.OrderItemInput { return []models.OrderItemInput{line(cutlet, 1)} }, svc)

	created, rejected := 0, 0
	for i, r := range results {
		if r.err != nil {
			t.Fatalf("заказ %d: неожиданная ошибка: %v", i, r.err)
		}
		switch r.resp.Status {
		case StatusCreated:
			created++
		case StatusRejected:
			rejected++
		}
	}
	if created != 10 || rejected != n-10 {
		t.Errorf("создано %d, отклонено %d; ожидали 10 / %d (запаса ровно на 10 порций)", created, rejected, n-10)
	}
	for _, b := range []string{b1, b2, b3} {
		if d.Remaining(b) != 0 || d.BatchStatus(b) != "depleted" {
			t.Errorf("партия %s: остаток %v, статус %s", b, d.Remaining(b), d.BatchStatus(b))
		}
	}
	if got := d.MovementSum("order"); got != -1000 {
		t.Errorf("списано %v, ожидали ровно 1000", got)
	}
	if d.Count("orders", "status='created'") != 10 || d.Count("orders", "status='rejected'") != int64(n-10) {
		t.Error("число заказов в БД не совпало с ответами")
	}
	d.AssertInvariants()
}

// Заказы с пересекающимися, но по-разному упорядоченными наборами ингредиентов:
// без детерминированного порядка блокировок здесь возникали бы дедлоки.
func TestOrder_Concurrent_OverlappingProducts_NoDeadlocksAndConsistentStock(t *testing.T) {
	d := testutil.New(t)
	svc := NewOrderService(d.Pool)
	a, b, c := d.Product("A", "g"), d.Product("B", "g"), d.Product("C", "g")
	names := map[string]string{a: "A", b: "B", c: "C"}

	dishes := []string{
		d.Dish("D1", 1, testutil.Ing{Product: a, Qty: 1}, testutil.Ing{Product: b, Qty: 1}),
		d.Dish("D2", 1, testutil.Ing{Product: b, Qty: 1}, testutil.Ing{Product: c, Qty: 1}),
		d.Dish("D3", 1, testutil.Ing{Product: c, Qty: 1}, testutil.Ing{Product: a, Qty: 1}),
		d.Dish("D4", 1, testutil.Ing{Product: c, Qty: 1}, testutil.Ing{Product: b, Qty: 1}, testutil.Ing{Product: a, Qty: 1}),
	}
	const perProduct = 40.0
	for _, p := range []string{a, b, c} {
		for h := 1; h <= 4; h++ { // по 4 партии на продукт
			d.Batch(p, perProduct/4, float64(h*10))
		}
	}

	const n = 60
	results := runConcurrently(n, func(i int) []models.OrderItemInput {
		return []models.OrderItemInput{line(dishes[i%len(dishes)], i%2+1)}
	}, svc)

	consumed := map[string]float64{}
	created, rejected := 0, 0
	for i, r := range results {
		if r.err != nil {
			t.Fatalf("заказ %d: ошибка (дедлок/сбой?): %v", i, r.err)
		}
		switch r.resp.Status {
		case StatusCreated:
			created++
			for _, w := range r.resp.WriteOffs {
				consumed[names[w.ProductID]] += w.Quantity
			}
		case StatusRejected:
			rejected++
			if len(r.resp.WriteOffs) != 0 {
				t.Errorf("отклонённый заказ %d содержит списания", i)
			}
		default:
			t.Errorf("заказ %d: статус %q", i, r.resp.Status)
		}
	}
	if created == 0 || rejected == 0 {
		t.Errorf("создано %d, отклонено %d: спрос в 2 раза превышает запас, ожидали и то, и другое", created, rejected)
	}
	if created+rejected != n {
		t.Errorf("обработано %d из %d", created+rejected, n)
	}

	// Списанное по ответам должно в точности совпасть с тем, что исчезло со склада.
	for p, name := range names {
		left := d.Float(`SELECT COALESCE(sum(remaining_quantity),0)::float8 FROM batches WHERE product_id = $1::uuid`, p)
		if left < 0 || left > perProduct {
			t.Errorf("продукт %s: остаток %v вне [0, %v]", name, left, perProduct)
		}
		if got := perProduct - left; got != consumed[name] {
			t.Errorf("продукт %s: со склада ушло %v, а по ответам заказов %v", name, got, consumed[name])
		}
	}
	if d.Count("orders") != n {
		t.Errorf("в БД %d заказов, ожидали %d", d.Count("orders"), n)
	}
	d.AssertInvariants()
	t.Logf("создано %d, отклонено %d", created, rejected)
}

func TestOrder_Concurrent_NumbersAreUnique(t *testing.T) {
	d := testutil.New(t)
	svc := NewOrderService(d.Pool)
	p := d.Product("Мука", "g")
	dish := d.Dish("Блин", 10, testutil.Ing{Product: p, Qty: 1})
	d.Batch(p, 1000, 10)

	results := runConcurrently(20, func(int) []models.OrderItemInput { return []models.OrderItemInput{line(dish, 1)} }, svc)
	seen := map[int64]bool{}
	for _, r := range results {
		if r.err != nil {
			t.Fatal(r.err)
		}
		if seen[r.resp.Number] {
			t.Errorf("номер заказа %d повторился", r.resp.Number)
		}
		seen[r.resp.Number] = true
	}
}
