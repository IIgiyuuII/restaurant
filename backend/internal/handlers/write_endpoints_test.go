package handlers_test

import (
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

const zeroUUID = "00000000-0000-0000-0000-000000000000"

// errorBody проверяет формат ошибки {"error": "..."} и возвращает текст.
func errorBody(t *testing.T, a *app, path string, body any, code int) string {
	t.Helper()
	rec := a.post(path, body)
	expect(t, rec, code)
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type ошибки = %q", ct)
	}
	m := decode[map[string]string](t, rec)
	if m["error"] == "" || len(m) != 1 {
		t.Fatalf("ожидали {\"error\": \"...\"}, получили %v", m)
	}
	return m["error"]
}

func bigBody() string {
	// > 1 MiB валидного по форме JSON
	return `{"items":[],"pad":"` + strings.Repeat("x", 1<<20+10) + `"}`
}

// ---------------- POST /api/deliveries ----------------

func TestCreateDelivery_Created(t *testing.T) {
	a := newApp(t)
	milk := a.d.Product("Молоко", "ml")

	rec := a.post("/api/deliveries", map[string]any{
		"number":        "D-100",
		"delivery_date": "2026-01-05T10:00:00Z",
		"items":         []map[string]any{{"product_id": milk, "quantity": 5000, "shelf_life_hours": 72}},
	})
	expect(t, rec, http.StatusCreated)
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q", ct)
	}

	resp := decode[models.DeliveryResponse](t, rec)
	if resp.ID == "" || resp.Number != "D-100" || len(resp.Batches) != 1 {
		t.Fatalf("%+v", resp)
	}
	b := resp.Batches[0]
	if b.Product != "Молоко" || b.Unit != "ml" || b.Quantity != 5000 || b.ShelfLifeHours != 72 {
		t.Errorf("партия: %+v", b)
	}
	if b.ReceivedAt.Format("2006-01-02T15:04:05Z") != "2026-01-05T10:00:00Z" || b.ExpiresAt.Format("2006-01-02T15:04:05Z") != "2026-01-08T10:00:00Z" {
		t.Errorf("сроки: %v → %v", b.ReceivedAt, b.ExpiresAt)
	}
	wantKeys(t, keys(t, []byte(rec.Body.String())), "id", "number", "delivery_date", "created_at", "batches")
	raw := decode[struct {
		Batches []map[string]any `json:"batches"`
	}](t, rec)
	for _, k := range []string{"id", "product_id", "product", "unit", "quantity", "shelf_life_hours", "received_at", "expires_at"} {
		if _, ok := raw.Batches[0][k]; !ok {
			t.Errorf("в batch нет ключа %q", k)
		}
	}
}

func TestCreateDelivery_MakesStockAndStoplistReact(t *testing.T) {
	a := newApp(t)
	bacon := a.d.Product("Бекон", "g")
	a.d.Dish("Карбонара", 490, testutil.Ing{Product: bacon, Qty: 100})
	if n := len(decode[[]models.StopDish](t, a.get("/api/stoplist"))); n != 1 {
		t.Fatalf("до поставки в стоп-листе %d блюд", n)
	}

	expect(t, a.post("/api/deliveries", map[string]any{
		"items": []map[string]any{{"product_id": bacon, "quantity": 300, "shelf_life_hours": 48}},
	}), http.StatusCreated)

	if n := len(decode[[]models.StopDish](t, a.get("/api/stoplist"))); n != 0 {
		t.Errorf("после поставки стоп-лист должен быть пуст, блюд: %d", n)
	}
	dishes := decode[[]models.DishAvailability](t, a.get("/api/dishes"))
	if dishes[0].Portions != 3 {
		t.Errorf("порций %d, ожидали 3", dishes[0].Portions)
	}
}

func TestCreateDelivery_BadRequests(t *testing.T) {
	a := newApp(t)
	p := a.d.Product("Мука", "g")
	eggs := a.d.Product("Яйцо", "pcs")
	item := func(m map[string]any) map[string]any {
		base := map[string]any{"product_id": p, "quantity": 10, "shelf_life_hours": 24}
		for k, v := range m {
			base[k] = v
		}
		return map[string]any{"items": []map[string]any{base}}
	}

	cases := []struct {
		name string
		body any
		part string
	}{
		{"пустое тело", "", "некорректный JSON"},
		{"невалидный JSON", "{", "некорректный JSON"},
		{"массив вместо объекта", "[]", "некорректный JSON"},
		{"quantity строкой", `{"items":[{"product_id":"x","quantity":"много","shelf_life_hours":1}]}`, "некорректный JSON"},
		{"дата не в формате RFC3339", `{"delivery_date":"вчера","items":[]}`, "некорректный JSON"},
		{"нет items", map[string]any{}, "не содержит"},
		{"пустой items", map[string]any{"items": []any{}}, "не содержит"},
		{"quantity = 0", item(map[string]any{"quantity": 0}), "quantity"},
		{"отрицательный срок", item(map[string]any{"shelf_life_hours": -1}), "shelf_life_hours"},
		{"больше 3 знаков после запятой", item(map[string]any{"quantity": 1.0004}), "3 знаков"},
		{"дробный срок хранения", item(map[string]any{"shelf_life_hours": 1.5}), "целым"},
		{"срок хранения больше года", item(map[string]any{"shelf_life_hours": 8761}), "shelf_life_hours"},
		{"превышен лимит для граммов", item(map[string]any{"quantity": 100001}), "не может превышать"},
		{"превышен лимит для штук", item(map[string]any{"product_id": eggs, "quantity": 1001}), "не может превышать"},
		{"дробные штуки", item(map[string]any{"product_id": eggs, "quantity": 2.5}), "целым"},
		{"неизвестный продукт", item(map[string]any{"product_id": zeroUUID}), "не найден"},
		{"мусорный product_id", item(map[string]any{"product_id": "мусор"}), "не найден"},
		{"слишком большое тело", bigBody(), "некорректный JSON"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			msg := errorBody(t, a, "/api/deliveries", c.body, http.StatusBadRequest)
			if !strings.Contains(msg, c.part) {
				t.Errorf("сообщение %q не содержит %q", msg, c.part)
			}
		})
	}
	if a.d.Count("deliveries") != 0 {
		t.Error("ни одна из некорректных поставок не должна быть сохранена")
	}
}

func TestCreateDelivery_DuplicateNumberIs409(t *testing.T) {
	a := newApp(t)
	p := a.d.Product("Мука", "g")
	body := map[string]any{"number": "D-1", "items": []map[string]any{{"product_id": p, "quantity": 1, "shelf_life_hours": 1}}}

	expect(t, a.post("/api/deliveries", body), http.StatusCreated)
	msg := errorBody(t, a, "/api/deliveries", body, http.StatusConflict)
	if !strings.Contains(msg, "D-1") {
		t.Errorf("сообщение должно называть номер: %q", msg)
	}
}

func TestCreateDelivery_AcceptsValuesExactlyAtLimits(t *testing.T) {
	a := newApp(t)
	flour := a.d.Product("Мука", "g")
	eggs := a.d.Product("Яйцо", "pcs")
	expect(t, a.post("/api/deliveries", map[string]any{
		"items": []map[string]any{
			{"product_id": flour, "quantity": 100000, "shelf_life_hours": 8760},
			{"product_id": eggs, "quantity": 1000, "shelf_life_hours": 1},
			{"product_id": flour, "quantity": 0.001, "shelf_life_hours": 24},
		},
	}), http.StatusCreated)
}

func TestCreateDelivery_UnknownFieldsAreIgnored(t *testing.T) {
	a := newApp(t)
	p := a.d.Product("Мука", "g")
	expect(t, a.post("/api/deliveries", `{"extra":1,"items":[{"product_id":"`+p+`","quantity":1,"shelf_life_hours":1,"note":"x"}]}`),
		http.StatusCreated)
}

// ---------------- POST /api/orders ----------------

func orderBody(dish string, qty int) map[string]any {
	return map[string]any{"items": []map[string]any{{"dish_id": dish, "quantity": qty}}}
}

func TestCreateOrder_Created(t *testing.T) {
	a := newApp(t)
	milk := a.d.Product("Молоко", "ml")
	eggs := a.d.Product("Яйцо", "pcs")
	omelet := a.d.Dish("Омлет", 250, testutil.Ing{Product: milk, Qty: 50}, testutil.Ing{Product: eggs, Qty: 3})
	a.d.Batch(milk, 1000, 48)
	a.d.Batch(eggs, 100, 48)

	rec := a.post("/api/orders", orderBody(omelet, 2))
	expect(t, rec, http.StatusCreated)

	resp := decode[models.OrderResponse](t, rec)
	if resp.Status != "created" || resp.Number <= 0 || len(resp.Items) != 1 || resp.Items[0].Name != "Омлет" || len(resp.WriteOffs) != 2 {
		t.Fatalf("%+v", resp)
	}
	got := keys(t, []byte(rec.Body.String()))
	wantKeys(t, got, "id", "number", "status", "created_at", "items", "write_offs")
	for _, absent := range []string{"reason", "shortages"} {
		if got[absent] {
			t.Errorf("в ответе успешного заказа не должно быть %q (omitempty)", absent)
		}
	}
	// Остатки реально уменьшились.
	prods := decode[[]models.ProductStock](t, a.get("/api/products"))
	for _, p := range prods {
		if p.Name == "Молоко" && p.Quantity != 900 || p.Name == "Яйцо" && p.Quantity != 94 {
			t.Errorf("остаток %s: %v", p.Name, p.Quantity)
		}
	}
}

func TestCreateOrder_RejectedIs409WithReason(t *testing.T) {
	a := newApp(t)
	milk := a.d.Product("Молоко", "ml")
	omelet := a.d.Dish("Омлет", 250, testutil.Ing{Product: milk, Qty: 50})
	a.d.Batch(milk, 120, 48)

	rec := a.post("/api/orders", orderBody(omelet, 3)) // нужно 150, есть 120
	expect(t, rec, http.StatusConflict)

	resp := decode[models.OrderResponse](t, rec)
	if resp.Status != "rejected" || resp.Reason != "Не хватает: Молоко — нужно 150 мл, есть 120 мл" {
		t.Errorf("status=%q reason=%q", resp.Status, resp.Reason)
	}
	if len(resp.Shortages) != 1 || resp.Shortages[0].Needed != 150 || resp.Shortages[0].Available != 120 {
		t.Errorf("shortages: %+v", resp.Shortages)
	}
	got := keys(t, []byte(rec.Body.String()))
	wantKeys(t, got, "id", "number", "status", "reason", "shortages", "items")
	if got["write_offs"] {
		t.Error("в отказе не должно быть write_offs")
	}
	// Склад не тронут.
	if q := decode[[]models.ProductStock](t, a.get("/api/products"))[0].Quantity; q != 120 {
		t.Errorf("остаток %v, ожидали 120", q)
	}
}

func TestCreateOrder_BadRequests(t *testing.T) {
	a := newApp(t)
	p := a.d.Product("Мука", "g")
	dish := a.d.Dish("Блин", 100, testutil.Ing{Product: p, Qty: 10})
	a.d.Batch(p, 1000, 48)

	cases := []struct {
		name string
		body any
		part string
	}{
		{"пустое тело", "", "некорректный JSON"},
		{"невалидный JSON", "{items:", "некорректный JSON"},
		{"количество дробное", `{"items":[{"dish_id":"x","quantity":1.5}]}`, "некорректный JSON"},
		{"количество строкой", `{"items":[{"dish_id":"x","quantity":"2"}]}`, "некорректный JSON"},
		{"нет позиций", map[string]any{"items": []any{}}, "пуст"},
		{"неизвестное блюдо", orderBody(zeroUUID, 1), "не найдено"},
		{"мусорный dish_id", orderBody("мусор", 1), "не найдено"},
		{"нулевое количество", orderBody(dish, 0), "quantity"},
		{"слишком много порций", orderBody(dish, 101), "quantity"},
		{"слишком большое тело", bigBody(), "некорректный JSON"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			msg := errorBody(t, a, "/api/orders", c.body, http.StatusBadRequest)
			if !strings.Contains(msg, c.part) {
				t.Errorf("сообщение %q не содержит %q", msg, c.part)
			}
		})
	}
	if a.d.Count("orders") != 0 {
		t.Error("некорректные запросы не должны создавать заказов")
	}
}

func TestCreateOrder_ConcurrentRequestsNeverOversell(t *testing.T) {
	a := newApp(t)
	meat := a.d.Product("Мясо", "g")
	cutlet := a.d.Dish("Котлета", 300, testutil.Ing{Product: meat, Qty: 100})
	a.d.Batch(meat, 500, 10)
	a.d.Batch(meat, 500, 20) // ровно 10 порций

	const n = 25
	codes := make(chan int, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			codes <- a.post("/api/orders", orderBody(cutlet, 1)).Code
		}()
	}
	close(start)
	wg.Wait()
	close(codes)

	count := map[int]int{}
	for c := range codes {
		count[c]++
	}
	if count[http.StatusCreated] != 10 || count[http.StatusConflict] != n-10 || len(count) != 2 {
		t.Errorf("коды ответов: %v; ожидали 10×201 и %d×409", count, n-10)
	}
	a.d.AssertInvariants()
}

// ---------------- POST /api/writeoffs ----------------

func TestWriteOffs_Post(t *testing.T) {
	a := newApp(t)
	p := a.d.Product("Молоко", "ml")
	e1 := a.d.Batch(p, 100, -1)
	e2 := a.d.Batch(p, 200, -2)
	live := a.d.Batch(p, 300, 5)

	// Конкретные партии.
	rec := a.post("/api/writeoffs", map[string]any{"batch_ids": []string{e1, live}})
	expect(t, rec, http.StatusOK)
	res := decode[models.ExpiryWriteOffResult](t, rec)
	if res.WrittenOff != 1 || len(res.Items) != 1 || res.Items[0].BatchID != e1 || res.Items[0].Quantity != 100 {
		t.Errorf("%+v", res)
	}
	wantKeys(t, keys(t, []byte(rec.Body.String())), "written_off", "items")
	if a.d.BatchStatus(live) != "active" || a.d.BatchStatus(e2) != "active" {
		t.Error("лишние партии списаны")
	}

	// Пустое тело = все оставшиеся просроченные.
	res = decode[models.ExpiryWriteOffResult](t, a.post("/api/writeoffs", nil))
	if res.WrittenOff != 1 || res.Items[0].BatchID != e2 {
		t.Errorf("%+v", res)
	}
	a.d.AssertInvariants()
}

func TestWriteOffs_EmptyBodyVariantsMeanAll(t *testing.T) {
	for name, body := range map[string]any{"нет тела": nil, "{}": "{}", "пустой список": `{"batch_ids":[]}`, "null": `{"batch_ids":null}`} {
		t.Run(name, func(t *testing.T) {
			a := newApp(t)
			p := a.d.Product("Молоко", "ml")
			a.d.Batch(p, 100, -1)
			a.d.Batch(p, 100, -2)
			res := decode[models.ExpiryWriteOffResult](t, a.post("/api/writeoffs", body))
			if res.WrittenOff != 2 {
				t.Errorf("списано %d, ожидали 2", res.WrittenOff)
			}
		})
	}
}

func TestWriteOffs_NothingToWriteOffReturnsEmptyArray(t *testing.T) {
	a := newApp(t)
	rec := a.post("/api/writeoffs", nil)
	expect(t, rec, http.StatusOK)
	raw := decode[map[string]any](t, rec)
	if items, ok := raw["items"].([]any); !ok || len(items) != 0 || raw["written_off"] != float64(0) {
		t.Errorf("%v", raw)
	}
}

func TestWriteOffs_BadRequests(t *testing.T) {
	a := newApp(t)
	p := a.d.Product("Молоко", "ml")
	good := a.d.Batch(p, 100, -1)

	tooMany := make([]string, 201)
	for i := range tooMany {
		tooMany[i] = zeroUUID
	}
	cases := []struct {
		name string
		body any
		part string
	}{
		{"невалидный JSON", "{", "некорректный JSON"},
		{"batch_ids не массив", `{"batch_ids":"abc"}`, "некорректный JSON"},
		{"мусорный id", map[string]any{"batch_ids": []string{good, "мусор"}}, "batch_id"},
		{"пустой id", map[string]any{"batch_ids": []string{"  "}}, "batch_id"},
		{"слишком много id", map[string]any{"batch_ids": tooMany}, "слишком много"},
		{"слишком большое тело", `{"batch_ids":["` + strings.Repeat("x", 1<<20+10) + `"]}`, "некорректный JSON"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			msg := errorBody(t, a, "/api/writeoffs", c.body, http.StatusBadRequest)
			if !strings.Contains(msg, c.part) {
				t.Errorf("сообщение %q не содержит %q", msg, c.part)
			}
		})
	}
	if a.d.BatchStatus(good) != "active" {
		t.Error("при ошибке валидации ничего не должно списываться")
	}
}

// ---------------- Сквозной сценарий через HTTP ----------------

func TestEndToEnd_DeliveryOrderStoplistRestockWriteoff(t *testing.T) {
	a := newApp(t)
	cheese := a.d.Product("Сыр", "g", 500)
	dough := a.d.Product("Тесто", "g", 500)
	pizza := a.d.Dish("Пицца", 550, testutil.Ing{Product: cheese, Qty: 150}, testutil.Ing{Product: dough, Qty: 200})

	// 1. Склад пуст: пицца в стоп-листе, оба продукта просят пополнения.
	if n := len(decode[[]models.StopDish](t, a.get("/api/stoplist"))); n != 1 {
		t.Fatalf("стоп-лист: %d", n)
	}
	if n := len(decode[[]models.RestockItem](t, a.get("/api/restock"))); n != 2 {
		t.Fatalf("restock: %d", n)
	}
	expect(t, a.post("/api/orders", orderBody(pizza, 1)), http.StatusConflict)

	// 2. Поставка: сыр 450 г, тесто на 400 г (2 порции) + просроченное тесто «задним числом».
	expect(t, a.post("/api/deliveries", map[string]any{
		"number": "E2E-1",
		"items": []map[string]any{
			{"product_id": cheese, "quantity": 450, "shelf_life_hours": 48},
			{"product_id": dough, "quantity": 400, "shelf_life_hours": 48},
		},
	}), http.StatusCreated)
	expect(t, a.post("/api/deliveries", map[string]any{
		"number": "E2E-OLD", "delivery_date": "2020-01-01T00:00:00Z",
		"items": []map[string]any{{"product_id": dough, "quantity": 999, "shelf_life_hours": 24}},
	}), http.StatusCreated)

	dishes := decode[[]models.DishAvailability](t, a.get("/api/dishes"))
	if dishes[0].Portions != 2 {
		t.Fatalf("порций %d, ожидали 2 (просроченное тесто не считается)", dishes[0].Portions)
	}
	if n := len(decode[[]models.StopDish](t, a.get("/api/stoplist"))); n != 0 {
		t.Fatalf("стоп-лист должен опустеть")
	}

	// 3. Партии: просроченная видна с флагом expired.
	var expiredBatches int
	for _, b := range decode[[]models.BatchStock](t, a.get("/api/batches")) {
		if b.Expired {
			expiredBatches++
			if b.DeliveryNumber != "E2E-OLD" {
				t.Errorf("просрочена партия %s", b.DeliveryNumber)
			}
		}
	}
	if expiredBatches != 1 {
		t.Fatalf("просроченных партий %d, ожидали 1", expiredBatches)
	}

	// 4. Заказ 2 порций → всё списано, пицца снова в стоп-листе, горячих предложений нет.
	rec := a.post("/api/orders", orderBody(pizza, 2))
	expect(t, rec, http.StatusCreated)
	if n := len(decode[[]models.StopDish](t, a.get("/api/stoplist"))); n != 1 {
		t.Fatalf("после продажи всего запаса пицца должна вернуться в стоп-лист")
	}
	expect(t, a.post("/api/orders", orderBody(pizza, 1)), http.StatusConflict)
	hist := decode[[]models.OrderHistory](t, a.get("/api/orders"))
	if len(hist) != 3 || hist[0].Status != "rejected" || hist[1].Status != "created" || hist[2].Status != "rejected" {
		t.Errorf("история заказов: %+v", hist)
	}

	// 5. Списание просрочки: попадает в отчёт, партий expired больше нет.
	res := decode[models.ExpiryWriteOffResult](t, a.post("/api/writeoffs", nil))
	if res.WrittenOff != 1 || res.Items[0].Quantity != 999 {
		t.Errorf("%+v", res)
	}
	rep := decode[models.ExpiryReport](t, a.get("/api/writeoffs"))
	if rep.TotalBatches != 1 || rep.ByProduct[0].Name != "Тесто" {
		t.Errorf("%+v", rep)
	}
	for _, b := range decode[[]models.BatchStock](t, a.get("/api/batches")) {
		if b.Expired {
			t.Error("после списания просроченных партий не должно остаться")
		}
	}

	// 6. Инвариант склада сохранился на всём пути.
	a.d.AssertInvariants()
}
