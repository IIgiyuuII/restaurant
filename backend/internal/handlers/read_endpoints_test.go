package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

// ---------------- /health ----------------

func TestHealth_OK(t *testing.T) {
	a := newApp(t)
	rec := a.get("/health")
	expect(t, rec, http.StatusOK)
	if rec.Body.String() != "ok" {
		t.Errorf("тело %q", rec.Body.String())
	}
}

func TestHealth_DBDown(t *testing.T) {
	testutil.QuietLogs(t)
	a := newApp(t)
	a.d.Pool.Close()
	rec := a.get("/health")
	expect(t, rec, http.StatusInternalServerError)
	if !strings.Contains(rec.Body.String(), "db down") {
		t.Errorf("тело %q", rec.Body.String())
	}
}

// ---------------- /api/products ----------------

func TestProducts_EmptyAndShape(t *testing.T) {
	a := newApp(t)
	assertEmptyArray(t, a.get("/api/products"))

	milk := a.d.Product("Молоко", "ml")
	a.d.Product("Абрикос", "g") // без партий
	a.d.Batch(milk, 300, 5)
	a.d.Batch(milk, 700, 50)
	a.d.Batch(milk, 999, -1) // просрочена — не считается

	rec := a.get("/api/products")
	expect(t, rec, http.StatusOK)
	list := decode[[]models.ProductStock](t, rec)
	if len(list) != 2 || list[0].Name != "Абрикос" || list[1].Name != "Молоко" {
		t.Fatalf("ожидали сортировку по имени: %+v", list)
	}
	if list[0].Quantity != 0 || list[0].NearestExpiry != nil {
		t.Errorf("продукт без партий: %+v", list[0])
	}
	m := list[1]
	if m.ID != milk || m.Unit != "ml" || m.Quantity != 1000 {
		t.Errorf("молоко: %+v", m)
	}
	if m.NearestExpiry == nil {
		t.Fatal("у молока должен быть ближайший срок")
	}
	if d := time.Until(*m.NearestExpiry); d < 4*time.Hour+50*time.Minute || d > 5*time.Hour+10*time.Minute {
		t.Errorf("ближайший срок через %v, ожидали ≈ 5 ч", d)
	}

	// Контракт для клиентов: ключи и формат даты (RFC3339 разбирают все JS-движки).
	wantKeys(t, keys(t, firstElem(t, rec)), "id", "name", "unit", "quantity", "nearest_expiry")
	raw := decode[[]map[string]any](t, rec)
	if raw[0]["nearest_expiry"] != nil {
		t.Errorf("nearest_expiry должен быть null без партий: %v", raw[0]["nearest_expiry"])
	}
	s, _ := raw[1]["nearest_expiry"].(string)
	if _, err := time.Parse(time.RFC3339Nano, s); err != nil {
		t.Errorf("nearest_expiry %q не в формате RFC3339: %v", s, err)
	}
}

func TestProducts_ContentType(t *testing.T) {
	a := newApp(t)
	rec := a.get("/api/products")
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q", ct)
	}
}

// ---------------- /api/stoplist ----------------

func TestStoplist(t *testing.T) {
	a := newApp(t)
	assertEmptyArray(t, a.get("/api/stoplist"))

	cheese := a.d.Product("Сыр", "g")
	bacon := a.d.Product("Бекон", "g")
	a.d.Dish("Пицца", 500, testutil.Ing{Product: cheese, Qty: 100})
	b := a.d.Dish("Карбонара", 490, testutil.Ing{Product: bacon, Qty: 100})
	a.d.Dish("Антипасти", 300, testutil.Ing{Product: bacon, Qty: 10})
	a.d.Batch(cheese, 1000, 48)

	rec := a.get("/api/stoplist")
	expect(t, rec, http.StatusOK)
	list := decode[[]models.StopDish](t, rec)
	if len(list) != 2 || list[0].Name != "Антипасти" || list[1].Name != "Карбонара" {
		t.Fatalf("в стоп-листе должны быть блюда без бекона, по алфавиту: %+v", list)
	}
	for _, d := range list {
		if d.Portions != 0 || d.ID == "" {
			t.Errorf("%+v", d)
		}
	}
	wantKeys(t, keys(t, firstElem(t, rec)), "id", "name", "portions", "reason")
	if list[0].Reason == "" || !strings.Contains(list[0].Reason, "Бекон") {
		t.Errorf("причина стоп-листа должна содержать название недостающего ингредиента, получили %q", list[0].Reason)
	}

	// Поставка бекона снимает блюдо со стоп-листа.
	a.d.Batch(bacon, 100, 48)
	list = decode[[]models.StopDish](t, a.get("/api/stoplist"))
	if len(list) != 0 {
		t.Errorf("после поставки бекона стоп-лист должен опустеть: %+v (%s)", list, b)
	}
}

// ---------------- /api/dishes ----------------

func TestDishes(t *testing.T) {
	a := newApp(t)
	assertEmptyArray(t, a.get("/api/dishes"))

	flour := a.d.Product("Мука", "g")
	a.d.Dish("Блин", 120, testutil.Ing{Product: flour, Qty: 100})
	a.d.Dish("Булка", 80.5, testutil.Ing{Product: flour, Qty: 300})
	a.d.Batch(flour, 650, 48)

	rec := a.get("/api/dishes")
	expect(t, rec, http.StatusOK)
	list := decode[[]models.DishAvailability](t, rec)
	if len(list) != 2 || list[0].Name != "Блин" || list[1].Name != "Булка" {
		t.Fatalf("%+v", list)
	}
	if list[0].Portions != 6 || list[0].Price != 120 || list[1].Portions != 2 || list[1].Price != 80.5 {
		t.Errorf("порции/цены: %+v", list)
	}
	wantKeys(t, keys(t, firstElem(t, rec)), "id", "name", "price", "portions")

	// Блюда из стоп-листа тоже в меню — с portions = 0 (фронтенд серит их).
	a.d.Dish("Пирог", 300, testutil.Ing{Product: a.d.Product("Яблоко", "pcs"), Qty: 1})
	for _, d := range decode[[]models.DishAvailability](t, a.get("/api/dishes")) {
		if d.Name == "Пирог" && d.Portions != 0 {
			t.Errorf("пирог: порций %d", d.Portions)
		}
	}
}

// ---------------- /api/batches ----------------

func TestBatches(t *testing.T) {
	a := newApp(t)
	assertEmptyArray(t, a.get("/api/batches"))

	milk := a.d.Product("Молоко", "ml")
	flour := a.d.Product("Мука", "g")
	late := a.d.Batch(milk, 1000, 100)
	early := a.d.Batch(flour, 500, 5)
	expired := a.d.Batch(milk, 200, -3) // просрочена, но не списана → возвращается с expired=true
	depleted := a.d.BatchUsed(milk, 50, 50, 10)
	a.d.SetBatchStatus(depleted, "depleted")
	written := a.d.Batch(milk, 60, -5)
	a.d.SetBatchStatus(written, "expired")
	a.d.Exec(`UPDATE batches SET remaining_quantity = 0 WHERE id = $1::uuid`, written)

	rec := a.get("/api/batches")
	expect(t, rec, http.StatusOK)
	list := decode[[]models.BatchStock](t, rec)

	var ids []string
	for _, b := range list {
		ids = append(ids, b.ID)
	}
	want := []string{expired, early, late} // по возрастанию срока: просрочена, 5 ч, 100 ч
	if strings.Join(ids, ",") != strings.Join(want, ",") {
		t.Fatalf("порядок/состав партий:\n got  %v\n want %v", ids, want)
	}

	if !list[0].Expired || list[0].HoursLeft >= 0 {
		t.Errorf("просроченная партия: %+v", list[0])
	}
	if list[1].Expired || list[1].HoursLeft < 4.9 || list[1].HoursLeft > 5.1 {
		t.Errorf("партия на 5 ч: %+v", list[1])
	}
	b := list[1]
	if b.Product != "Мука" || b.Unit != "g" || b.ProductID != flour || b.InitialQty != 500 || b.RemainingQty != 500 ||
		!strings.HasPrefix(b.DeliveryNumber, "TST-") || b.ReceivedAt.IsZero() || b.ExpiresAt.IsZero() {
		t.Errorf("поля партии: %+v", b)
	}
	wantKeys(t, keys(t, firstElem(t, rec)),
		"id", "product_id", "product", "unit", "delivery_number",
		"initial_quantity", "remaining_quantity", "received_at", "expires_at", "hours_left", "expired")
}

func TestBatches_ProductFilter(t *testing.T) {
	a := newApp(t)
	milk := a.d.Product("Молоко", "ml")
	flour := a.d.Product("Мука", "g")
	a.d.Batch(milk, 100, 10)
	a.d.Batch(milk, 200, 20)
	a.d.Batch(flour, 300, 30)

	got := decode[[]models.BatchStock](t, a.get("/api/batches?product_id="+milk))
	if len(got) != 2 || got[0].Product != "Молоко" || got[1].Product != "Молоко" {
		t.Errorf("фильтр по молоку: %+v", got)
	}
	// Незнакомый/некорректный id — просто пустой список, не ошибка.
	assertEmptyArray(t, a.get("/api/batches?product_id=00000000-0000-0000-0000-000000000000"))
	assertEmptyArray(t, a.get("/api/batches?product_id=мусор"))
	// Пустой параметр = без фильтра.
	if n := len(decode[[]models.BatchStock](t, a.get("/api/batches?product_id="))); n != 3 {
		t.Errorf("без фильтра ожидали 3 партии, получили %d", n)
	}
}

// ---------------- /api/orders (история) ----------------

func TestOrdersHistory(t *testing.T) {
	a := newApp(t)
	assertEmptyArray(t, a.get("/api/orders"))

	milk := a.d.Product("Молоко", "ml")
	eggs := a.d.Product("Яйцо", "pcs")
	omelet := a.d.Dish("Омлет", 250, testutil.Ing{Product: milk, Qty: 50}, testutil.Ing{Product: eggs, Qty: 3})
	toast := a.d.Dish("Тост", 100, testutil.Ing{Product: eggs, Qty: 1})
	a.d.Batch(milk, 100, 48) // молока на 2 омлета
	a.d.Batch(eggs, 100, 48)

	a.post("/api/orders", map[string]any{"items": []map[string]any{{"dish_id": omelet, "quantity": 1}}})
	a.post("/api/orders", map[string]any{"items": []map[string]any{{"dish_id": toast, "quantity": 2}, {"dish_id": omelet, "quantity": 1}}})
	a.post("/api/orders", map[string]any{"items": []map[string]any{{"dish_id": omelet, "quantity": 5}}}) // отказ: молока не хватает

	rec := a.get("/api/orders")
	expect(t, rec, http.StatusOK)
	list := decode[[]models.OrderHistory](t, rec)
	if len(list) != 3 {
		t.Fatalf("заказов %d, ожидали 3", len(list))
	}
	// Новые первыми.
	if !(list[0].Number > list[1].Number && list[1].Number > list[2].Number) {
		t.Errorf("порядок номеров: %d, %d, %d", list[0].Number, list[1].Number, list[2].Number)
	}
	if list[0].Status != "rejected" || !strings.Contains(list[0].Reason, "Молоко") {
		t.Errorf("последний заказ — отказ с причиной: %+v", list[0])
	}
	if list[1].Status != "created" || list[1].Reason != "" {
		t.Errorf("второй заказ: %+v", list[1])
	}
	// Позиции отсортированы по названию блюда.
	if len(list[1].Items) != 2 || list[1].Items[0].Name != "Омлет" || list[1].Items[1].Name != "Тост" || list[1].Items[1].Quantity != 2 {
		t.Errorf("позиции: %+v", list[1].Items)
	}
	wantKeys(t, keys(t, firstElem(t, rec)), "id", "number", "status", "created_at", "revenue", "revenue_estimated", "items")
}

// TestOrdersHistory_ReturnsAll — эндпоинт отдаёт всю историю,
// без LIMIT. Фронт пагинирует её локально.
func TestOrdersHistory_ReturnsAll(t *testing.T) {
    a := newApp(t)

    // Пустая история — [] (не null), чтобы фронт мог .map без проверок.
    assertEmptyArray(t, a.get("/api/orders"))

    // Создаём 25 заказов и проверяем, что все вернутся.
    for i := 0; i < 25; i++ {
        a.d.Exec(`INSERT INTO orders DEFAULT VALUES`)
    }

    list := decode[[]models.OrderHistory](t, a.get("/api/orders"))
    if len(list) != 25 {
        t.Fatalf("получено %d заказов, ожидали все 25 (эндпоинт без LIMIT)", len(list))
    }

    // Новые первыми — фронт полагается на порядок.
    for i := 1; i < len(list); i++ {
        if list[i-1].Number <= list[i].Number {
            t.Fatalf("порядок нарушен: %d, %d", list[i-1].Number, list[i].Number)
        }
    }

    // `?limit=N` теперь игнорируется — проверяем, что контракт это фиксирует.
    limited := decode[[]models.OrderHistory](t, a.get("/api/orders?limit=5"))
    if len(limited) != 25 {
        t.Fatalf("параметр ?limit больше не должен ограничивать: получено %d, ожидали 25", len(limited))
    }
}

// ---------------- /api/hot-offers ----------------

func TestHotOffers(t *testing.T) {
	a := newApp(t)
	assertEmptyArray(t, a.get("/api/hot-offers"))

	milk := a.d.Product("Молоко", "ml")
	a.d.Dish("Омлет", 250, testutil.Ing{Product: milk, Qty: 50})
	a.d.Batch(milk, 500, 5)

	rec := a.get("/api/hot-offers")
	expect(t, rec, http.StatusOK)
	list := decode[[]models.HotOffer](t, rec)
	if len(list) != 1 || list[0].Name != "Омлет" || list[0].Level != "critical" || len(list[0].Reasons) != 1 || list[0].Summary == "" {
		t.Fatalf("%+v", list)
	}
	wantKeys(t, keys(t, firstElem(t, rec)),
		"dish_id", "name", "price", "portions", "score", "level", "hours_left", "summary", "reasons")
	offer := decode[[]map[string]any](t, rec)[0]
	reason := offer["reasons"].([]any)[0].(map[string]any)
	for _, k := range []string{"product_id", "product", "unit", "batch_id", "quantity", "expires_at",
		"hours_left", "urgency", "coverage_pct", "points", "text"} {
		if _, ok := reason[k]; !ok {
			t.Errorf("в reason нет ключа %q", k)
		}
	}
}

func TestHotOffers_LimitParam(t *testing.T) {
	a := newApp(t)
	for i := 0; i < 4; i++ {
		p := a.d.Product("П"+string(rune('А'+i)), "g")
		a.d.Dish("Блюдо"+string(rune('А'+i)), 100, testutil.Ing{Product: p, Qty: 10})
		a.d.Batch(p, 100, float64(5+i))
	}
	for query, want := range map[string]int{"": 4, "?limit=2": 2, "?limit=abc": 4, "?limit=-1": 4, "?limit=500": 4} {
		if n := len(decode[[]models.HotOffer](t, a.get("/api/hot-offers"+query))); n != want {
			t.Errorf("%q: %d предложений, ожидали %d", query, n, want)
		}
	}
}

// ---------------- /api/restock ----------------

func TestRestock(t *testing.T) {
	a := newApp(t)
	assertEmptyArray(t, a.get("/api/restock"))

	bacon := a.d.Product("Бекон", "g", 1500)
	a.d.Dish("Карбонара", 490, testutil.Ing{Product: bacon, Qty: 100})

	rec := a.get("/api/restock")
	expect(t, rec, http.StatusOK)
	list := decode[[]models.RestockItem](t, rec)
	if len(list) != 1 {
		t.Fatalf("%+v", list)
	}
	it := list[0]
	if it.Name != "Бекон" || it.Status != "out" || it.MinStock != 1500 || it.Suggested != 3000 || it.BlockedDishes != 1 {
		t.Errorf("%+v", it)
	}
	wantKeys(t, keys(t, firstElem(t, rec)),
		"product_id", "name", "unit", "min_stock", "quantity", "status", "suggested_quantity", "blocked_dishes")
}

// ---------------- /api/writeoffs (отчёт) ----------------

func TestWriteoffsReport(t *testing.T) {
	a := newApp(t)

	rec := a.get("/api/writeoffs")
	expect(t, rec, http.StatusOK)
	rep := decode[models.ExpiryReport](t, rec)
	if rep.Days != 30 || rep.TotalBatches != 0 || rep.AutoCheckMinutes != 15 {
		t.Errorf("%+v", rep)
	}
	// Пустые массивы, а не null.
	raw := decode[map[string]any](t, rec)
	if _, ok := raw["by_product"].([]any); !ok {
		t.Errorf("by_product: %#v", raw["by_product"])
	}
	if _, ok := raw["recent"].([]any); !ok {
		t.Errorf("recent: %#v", raw["recent"])
	}
	wantKeys(t, keys(t, []byte(rec.Body.String())), "days", "total_batches", "by_product", "recent", "auto_check_minutes")

	// Реальное списание появляется в отчёте.
	p := a.d.Product("Молоко", "ml")
	a.d.Batch(p, 400, -2)
	expect(t, a.post("/api/writeoffs", nil), http.StatusOK)
	rep = decode[models.ExpiryReport](t, a.get("/api/writeoffs?days=7"))
	if rep.Days != 7 || rep.TotalBatches != 1 || len(rep.ByProduct) != 1 || rep.ByProduct[0].Quantity != 400 || len(rep.Recent) != 1 {
		t.Errorf("%+v", rep)
	}
}

func TestWriteoffsReport_DaysParam(t *testing.T) {
	a := newApp(t)
	for query, want := range map[string]int{"": 30, "?days=10": 10, "?days=abc": 30, "?days=0": 30, "?days=9999": 365} {
		if got := decode[models.ExpiryReport](t, a.get("/api/writeoffs"+query)).Days; got != want {
			t.Errorf("%q: days=%d, ожидали %d", query, got, want)
		}
	}
}

// ---------------- Роутинг ----------------

func TestRouting(t *testing.T) {
	a := newApp(t)
	cases := []struct {
		method, path string
		want         int
	}{
		{"GET", "/api/unknown", http.StatusNotFound},
		{"GET", "/", http.StatusNotFound},
		{"DELETE", "/api/orders", http.StatusMethodNotAllowed},
		{"PUT", "/api/deliveries", http.StatusMethodNotAllowed},
		{"POST", "/api/dishes", http.StatusMethodNotAllowed},
		{"GET", "/api/deliveries", http.StatusMethodNotAllowed}, // поставку можно только создать
		{"POST", "/api/restock", http.StatusMethodNotAllowed},
		{"POST", "/health", http.StatusMethodNotAllowed},
	}
	for _, c := range cases {
		if rec := a.do(c.method, c.path, nil); rec.Code != c.want {
			t.Errorf("%s %s → %d, ожидали %d", c.method, c.path, rec.Code, c.want)
		}
	}
}

// ---------------- Сбой БД: наружу не утекают внутренности ----------------

func TestDBFailure_Returns500WithoutLeakingDetails(t *testing.T) {
	testutil.QuietLogs(t)
	a := newApp(t)
	a.d.Pool.Close()

	reads := []string{"/api/products", "/api/stoplist", "/api/dishes", "/api/batches", "/api/orders",
		"/api/hot-offers", "/api/restock", "/api/writeoffs"}
	for _, path := range reads {
		rec := a.get(path)
		expectInternalError(t, rec, "GET "+path)
	}
	expectInternalError(t, a.post("/api/writeoffs", nil), "POST /api/writeoffs")
	expectInternalError(t, a.post("/api/deliveries", map[string]any{
		"items": []map[string]any{{"product_id": "00000000-0000-0000-0000-000000000000", "quantity": 1, "shelf_life_hours": 1}},
	}), "POST /api/deliveries")
	expectInternalError(t, a.post("/api/orders", map[string]any{
		"items": []map[string]any{{"dish_id": "00000000-0000-0000-0000-000000000000", "quantity": 1}},
	}), "POST /api/orders")
}

func expectInternalError(t *testing.T, r *httptest.ResponseRecorder, label string) {
	t.Helper()
	if r.Code != http.StatusInternalServerError {
		t.Errorf("%s → %d, ожидали 500; тело: %s", label, r.Code, r.Body.String())
		return
	}
	body := r.Body.String()
	if !strings.Contains(body, "внутренняя ошибка сервера") {
		t.Errorf("%s: нет общего сообщения: %s", label, body)
	}
	for _, leak := range []string{"closed pool", "pgx", "SELECT", "sql", "dial"} {
		if strings.Contains(strings.ToLower(body), strings.ToLower(leak)) {
			t.Errorf("%s: в ответе утекла внутренность %q: %s", label, leak, body)
		}
	}
}
