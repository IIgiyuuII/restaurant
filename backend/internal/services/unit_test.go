package services

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

// Юнит-тесты без БД: валидация, форматирование, типы ошибок.

func asValidation(t *testing.T, err error) *ValidationError {
	t.Helper()
	var ve *ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("ожидали *ValidationError, получили %T: %v", err, err)
	}
	return ve
}

// ---------------- Ошибки ----------------

func TestErrorTypes(t *testing.T) {
	if (&ValidationError{Msg: "плохо"}).Error() != "плохо" {
		t.Error("ValidationError.Error")
	}
	if (&ConflictError{Msg: "дубль"}).Error() != "дубль" {
		t.Error("ConflictError.Error")
	}
	if got := validation("позиция %d: %s", 3, "ой").Error(); got != "позиция 3: ой" {
		t.Errorf("validation форматирует неверно: %q", got)
	}
}

func TestPgCode(t *testing.T) {
	pg := &pgconn.PgError{Code: "23505"}
	cases := []struct {
		name string
		err  error
		want string
	}{
		{"nil", nil, ""},
		{"не postgres", errors.New("boom"), ""},
		{"postgres", pg, "23505"},
		{"обёрнутая", fmt.Errorf("ctx: %w", pg), "23505"},
	}
	for _, c := range cases {
		if got := pgCode(c.err); got != c.want {
			t.Errorf("%s: pgCode = %q, ожидали %q", c.name, got, c.want)
		}
	}
}

func TestBadBatchID(t *testing.T) {
	if badBatchID(nil) != nil {
		t.Error("nil должен остаться nil")
	}
	other := errors.New("db is down")
	if badBatchID(other) != other {
		t.Error("посторонняя ошибка должна вернуться как есть")
	}
	ve := asValidation(t, badBatchID(&pgconn.PgError{Code: pgInvalidText}))
	if !strings.Contains(ve.Msg, "batch_id") {
		t.Errorf("сообщение: %q", ve.Msg)
	}
}

// ---------------- normalizeOrder ----------------

func TestNormalizeOrder_Invalid(t *testing.T) {
	many := make([]models.OrderItemInput, maxOrderLines+1)
	for i := range many {
		many[i] = models.OrderItemInput{DishID: fmt.Sprintf("d%d", i), Quantity: 1}
	}
	cases := []struct {
		name  string
		items []models.OrderItemInput
		part  string
	}{
		{"пустой заказ", nil, "пуст"},
		{"слишком много позиций", many, "слишком много"},
		{"пустой dish_id", []models.OrderItemInput{{DishID: "  ", Quantity: 1}}, "dish_id"},
		{"нулевое количество", []models.OrderItemInput{{DishID: "a", Quantity: 0}}, "quantity"},
		{"отрицательное количество", []models.OrderItemInput{{DishID: "a", Quantity: -2}}, "quantity"},
		{"больше максимума", []models.OrderItemInput{{DishID: "a", Quantity: maxDishPortions + 1}}, "quantity"},
		{"сумма дублей больше максимума", []models.OrderItemInput{{DishID: "a", Quantity: 60}, {DishID: "A", Quantity: 50}}, "не более"},
		{"номер позиции в сообщении", []models.OrderItemInput{{DishID: "a", Quantity: 1}, {DishID: "", Quantity: 1}}, "позиция 2"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := normalizeOrder(models.CreateOrderRequest{Items: c.items})
			ve := asValidation(t, err)
			if !strings.Contains(ve.Msg, c.part) {
				t.Errorf("сообщение %q не содержит %q", ve.Msg, c.part)
			}
		})
	}
}

func TestNormalizeOrder_Valid(t *testing.T) {
	t.Run("максимум допустим", func(t *testing.T) {
		got, err := normalizeOrder(models.CreateOrderRequest{Items: []models.OrderItemInput{{DishID: "a", Quantity: maxDishPortions}}})
		if err != nil || len(got) != 1 || got[0].Quantity != maxDishPortions {
			t.Fatalf("%v %+v", err, got)
		}
	})
	t.Run("склеивает дубли без учёта регистра и пробелов", func(t *testing.T) {
		got, err := normalizeOrder(models.CreateOrderRequest{Items: []models.OrderItemInput{
			{DishID: " ABC-1 ", Quantity: 1},
			{DishID: "abc-1", Quantity: 2},
		}})
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 1 || got[0].DishID != "abc-1" || got[0].Quantity != 3 {
			t.Fatalf("ожидали одну позицию abc-1 × 3, получили %+v", got)
		}
	})
	t.Run("сохраняет порядок первого появления", func(t *testing.T) {
		got, err := normalizeOrder(models.CreateOrderRequest{Items: []models.OrderItemInput{
			{DishID: "b", Quantity: 1}, {DishID: "a", Quantity: 1}, {DishID: "b", Quantity: 1},
		}})
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 2 || got[0].DishID != "b" || got[1].DishID != "a" || got[0].Quantity != 2 {
			t.Fatalf("%+v", got)
		}
	})
	t.Run("ровно maxOrderLines позиций", func(t *testing.T) {
		items := make([]models.OrderItemInput, maxOrderLines)
		for i := range items {
			items[i] = models.OrderItemInput{DishID: fmt.Sprintf("d%d", i), Quantity: 1}
		}
		if got, err := normalizeOrder(models.CreateOrderRequest{Items: items}); err != nil || len(got) != maxOrderLines {
			t.Fatalf("%v, %d", err, len(got))
		}
	})
}

// ---------------- Форматирование ----------------

func TestFormatQty(t *testing.T) {
	cases := []struct {
		v    float64
		unit string
		want string
	}{
		{300, "g", "300 г"},
		{0, "g", "0 г"},
		{0.5, "ml", "0.5 мл"},
		{12.345, "pcs", "12.345 шт"},
		{1000000, "g", "1000000 г"},
		{5, "kg", "5 kg"}, // неизвестная единица выводится как есть
	}
	for _, c := range cases {
		if got := formatQty(c.v, c.unit); got != c.want {
			t.Errorf("formatQty(%v, %q) = %q, ожидали %q", c.v, c.unit, got, c.want)
		}
	}
}

func TestBuildReason(t *testing.T) {
	one := []models.Shortage{{Product: "Сыр", Unit: "g", Needed: 300, Available: 200}}
	if got, want := buildReason(one), "Не хватает: Сыр — нужно 300 г, есть 200 г"; got != want {
		t.Errorf("got %q\nwant %q", got, want)
	}
	many := []models.Shortage{
		{Product: "Бекон", Unit: "g", Needed: 100, Available: 0},
		{Product: "Яйцо", Unit: "pcs", Needed: 6, Available: 2},
	}
	want := "Не хватает: Бекон — нужно 100 г, есть 0 г; Яйцо — нужно 6 шт, есть 2 шт"
	if got := buildReason(many); got != want {
		t.Errorf("got %q\nwant %q", got, want)
	}
}

// ---------------- Валидация поставки (до обращения к БД) ----------------

func TestDeliveryCreate_Validation(t *testing.T) {
	svc := NewDeliveryService(nil) // до БД дело не дойдёт: валидация срабатывает раньше
	ok := models.DeliveryItemInput{ProductID: "p", Quantity: 10, ShelfLifeHours: 24}
	with := func(mod func(*models.DeliveryItemInput)) models.CreateDeliveryRequest {
		it := ok
		mod(&it)
		return models.CreateDeliveryRequest{Items: []models.DeliveryItemInput{it}}
	}
	future := time.Now().Add(time.Hour)
	tooMany := make([]models.DeliveryItemInput, maxDeliveryItems+1)
	for i := range tooMany {
		tooMany[i] = ok
	}

	cases := []struct {
		name string
		req  models.CreateDeliveryRequest
		part string
	}{
		{"нет позиций", models.CreateDeliveryRequest{}, "не содержит"},
		{"слишком много позиций", models.CreateDeliveryRequest{Items: tooMany}, "слишком много"},
		{"дата в будущем", models.CreateDeliveryRequest{DeliveryDate: &future, Items: []models.DeliveryItemInput{ok}}, "будущем"},
		{"пустой product_id", with(func(i *models.DeliveryItemInput) { i.ProductID = "  " }), "product_id"},
		{"quantity = 0", with(func(i *models.DeliveryItemInput) { i.Quantity = 0 }), "quantity"},
		{"quantity < 0", with(func(i *models.DeliveryItemInput) { i.Quantity = -1 }), "quantity"},
		{"quantity NaN", with(func(i *models.DeliveryItemInput) { i.Quantity = math.NaN() }), "quantity"},
		{"больше 3 знаков после запятой (0.0004)", with(func(i *models.DeliveryItemInput) { i.Quantity = 0.0004 }), "3 знаков"},
		{"больше 3 знаков после запятой (1.0004)", with(func(i *models.DeliveryItemInput) { i.Quantity = 1.0004 }), "3 знаков"},
		{"quantity +Inf", with(func(i *models.DeliveryItemInput) { i.Quantity = math.Inf(1) }), "знаков"},
		{"shelf_life = 0", with(func(i *models.DeliveryItemInput) { i.ShelfLifeHours = 0 }), "shelf_life_hours"},
		{"shelf_life < 0", with(func(i *models.DeliveryItemInput) { i.ShelfLifeHours = -5 }), "shelf_life_hours"},
		{"shelf_life NaN", with(func(i *models.DeliveryItemInput) { i.ShelfLifeHours = math.NaN() }), "shelf_life_hours"},
		{"shelf_life больше года", with(func(i *models.DeliveryItemInput) { i.ShelfLifeHours = maxShelfLifeHours + 1 }), "shelf_life_hours"},
		{"shelf_life дробный (1.5 ч)", with(func(i *models.DeliveryItemInput) { i.ShelfLifeHours = 1.5 }), "целым"},
		{"ошибка во второй позиции", models.CreateDeliveryRequest{Items: []models.DeliveryItemInput{ok, {ProductID: "p", Quantity: -1, ShelfLifeHours: 1}}}, "позиция 2"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res, err := svc.Create(context.Background(), c.req)
			if res != nil {
				t.Fatalf("при ошибке результата быть не должно: %+v", res)
			}
			ve := asValidation(t, err)
			if !strings.Contains(ve.Msg, c.part) {
				t.Errorf("сообщение %q не содержит %q", ve.Msg, c.part)
			}
		})
	}
}

// ---------------- ExpiryService без БД ----------------

func TestExpiry_AutoCheckMinutes(t *testing.T) {
	cases := []struct {
		every time.Duration
		want  int
	}{
		{0, 0},
		{-time.Minute, 0},
		{10 * time.Second, 1}, // меньше минуты округляется вверх до 1
		{time.Minute, 1},
		{15 * time.Minute, 15},
		{90 * time.Minute, 90},
		{DefaultAutoWriteOff, 15},
	}
	for _, c := range cases {
		if got := NewExpiryService(nil, c.every).AutoCheckMinutes(); got != c.want {
			t.Errorf("autoEvery=%v: %d, ожидали %d", c.every, got, c.want)
		}
	}
}

func TestExpiry_WriteOffValidationBeforeDB(t *testing.T) {
	svc := NewExpiryService(nil, 0)

	many := make([]string, maxWriteOffIDs+1)
	for i := range many {
		many[i] = "00000000-0000-0000-0000-000000000000"
	}
	ve := asValidation(t, func() error { _, err := svc.WriteOffExpired(context.Background(), many); return err }())
	if !strings.Contains(ve.Msg, "слишком много") {
		t.Errorf("сообщение: %q", ve.Msg)
	}

	ve = asValidation(t, func() error {
		_, err := svc.WriteOffExpired(context.Background(), []string{"00000000-0000-0000-0000-000000000000", "   "})
		return err
	}())
	if !strings.Contains(ve.Msg, "batch_id") {
		t.Errorf("сообщение: %q", ve.Msg)
	}
}

func TestExpiry_RunAutoWriteOffDisabledReturnsImmediately(t *testing.T) {
	testutil.QuietLogs(t)
	done := make(chan struct{})
	go func() {
		NewExpiryService(nil, 0).RunAutoWriteOff(context.Background())
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("при выключенном автосписании воркер должен сразу завершиться")
	}
}

// ---------------- Restock ----------------

func TestSuggestQuantity_Edges(t *testing.T) {
	cases := []struct {
		name          string
		unit          string
		min, have, ex float64
	}{
		{"мл с шагом 100", "ml", 150, 0, 300},
		{"штуки: ровно две нормы", "pcs", 1, 0, 2},
		{"крошечная нехватка округляется до шага", "g", 100, 199.99, 100},
		{"ровно две нормы — докупать нечего", "g", 500, 1000, 0},
		{"дробная норма штук", "pcs", 2.5, 0, 5},
	}
	for _, c := range cases {
		if got := suggestQuantity(c.unit, c.min, c.have); got != c.ex {
			t.Errorf("%s: suggestQuantity(%q,%v,%v) = %v, ожидали %v", c.name, c.unit, c.min, c.have, got, c.ex)
		}
	}
}

// Статус: «out» — продукта нет ИЛИ из-за него нельзя приготовить хотя бы одно блюдо; иначе «low».
func TestRestockStatus_Semantics(t *testing.T) {
	cases := []struct {
		name    string
		qty     float64
		blocked int
		want    string
	}{
		{"нет продукта", 0, 0, RestockOut},
		{"нет продукта и блюда заблокированы", 0, 3, RestockOut},
		{"отрицательный остаток считаем «нет»", -1, 0, RestockOut},
		{"остаток есть, блюд не блокирует", 0.001, 0, RestockLow},
		{"большой остаток, блюд не блокирует", 1e9, 0, RestockLow},
		{"остаток есть, но блокирует блюдо", 400, 1, RestockOut},
		{"остаток есть, блокирует несколько блюд", 400, 5, RestockOut},
	}
	for _, c := range cases {
		if got := restockStatus(c.qty, c.blocked); got != c.want {
			t.Errorf("%s: restockStatus(%v, %d) = %q, ожидали %q", c.name, c.qty, c.blocked, got, c.want)
		}
	}
}

func TestSuggestQuantity_BaseCases(t *testing.T) {
	cases := []struct {
		name          string
		unit          string
		min, have, ex float64
	}{
		{"низкий остаток", "g", 1000, 400, 1600},
		{"продукта нет", "g", 1500, 0, 3000},
		{"штуки — шаг 1", "pcs", 30, 5, 55},
		{"округление вверх до 100", "ml", 333, 0, 700},
		{"минимум не задан", "g", 0, 0, 0},
		{"запаса с избытком", "g", 1000, 2500, 0},
	}
	for _, c := range cases {
		if got := suggestQuantity(c.unit, c.min, c.have); got != c.ex {
			t.Errorf("%s: suggestQuantity(%q, %v, %v) = %v, ожидали %v", c.name, c.unit, c.min, c.have, got, c.ex)
		}
	}
}

func TestHasAtMostThreeDecimals(t *testing.T) {
	yes := []float64{0, 1, 0.5, 0.125, 1234.567, 100000, 0.001, 0.1 + 0.2 /* 0.30000000000000004 */, 99999.999}
	no := []float64{0.0004, 1.0004, 2.0005, 0.1234, 1e-7}
	for _, v := range yes {
		if !hasAtMostThreeDecimals(v) {
			t.Errorf("hasAtMostThreeDecimals(%v) = false, ожидали true", v)
		}
	}
	for _, v := range no {
		if hasAtMostThreeDecimals(v) {
			t.Errorf("hasAtMostThreeDecimals(%v) = true, ожидали false", v)
		}
	}
}

func TestMaxQtyForUnit(t *testing.T) {
	cases := map[string]float64{
		"g": maxQtyG, "ml": maxQtyMl, "pcs": maxQtyPcs,
		"": maxQtyG, "kg": maxQtyG, // незнакомая единица — безопасный дефолт (как граммы)
	}
	for unit, want := range cases {
		if got := maxQtyForUnit(unit); got != want {
			t.Errorf("maxQtyForUnit(%q) = %v, ожидали %v", unit, got, want)
		}
	}
	if maxQtyG != 100_000 || maxQtyMl != 100_000 || maxQtyPcs != 1_000 {
		t.Errorf("лимиты продублированы на фронте (DeliveryPage.tsx): g=%v ml=%v pcs=%v", maxQtyG, maxQtyMl, maxQtyPcs)
	}
}

// ---------------- Горячие предложения: дополнительные границы ----------------

func TestLevelFor_Boundaries(t *testing.T) {
	cases := map[float64]string{
		0.1: levelCritical, 11.99: levelCritical,
		12: levelHigh, 35.99: levelHigh,
		36: levelMedium, 71: levelMedium,
	}
	for h, want := range cases {
		if got := levelFor(h); got != want {
			t.Errorf("levelFor(%v) = %s, ожидали %s", h, got, want)
		}
	}
}

func TestFormatHoursLeft_Boundaries(t *testing.T) {
	cases := map[float64]string{
		0.001: "1 мин",
		0.99:  "59 мин",
		1:     "1 ч 0 мин",
		11.99: "11 ч 59 мин",
		12:    "12 ч",
		47.9:  "47 ч",
		48:    "2 дн.",
		71.9:  "2 дн.",
	}
	for h, want := range cases {
		if got := formatHoursLeft(h); got != want {
			t.Errorf("formatHoursLeft(%v) = %q, ожидали %q", h, got, want)
		}
	}
}

func TestUrgency_Properties(t *testing.T) {
	if urgency(-5) != 1 || urgency(0) != 1 {
		t.Error("для уже истёкших срочность максимальна (1)")
	}
	prev := urgency(0.1)
	for _, h := range []float64{1, 6, 12, 24, 48, 72, 500} {
		cur := urgency(h)
		if cur >= prev || cur <= 0 {
			t.Errorf("срочность должна строго убывать и оставаться > 0: urgency(%v) = %v после %v", h, cur, prev)
		}
		prev = cur
	}
}

func TestClampAndRound(t *testing.T) {
	if clamp01(-1) != 0 || clamp01(2) != 1 || clamp01(0.4) != 0.4 {
		t.Error("clamp01")
	}
	if round2(1.005) != 1 && round2(1.005) != 1.01 { // допускаем артефакт float
		t.Errorf("round2(1.005) = %v", round2(1.005))
	}
	if round2(0.12345) != 0.12 || round2(0.126) != 0.13 {
		t.Error("round2")
	}
}

func TestReasonText_PartialCoverage(t *testing.T) {
	b := hotBatch{product: "Тесто", unit: "g", milli: 3000_000}
	got := reasonText(b, 28.4, 0.87)
	for _, part := range []string{"Тесто", "партия 3000 г", "28 ч", "до 87% партии"} {
		if !strings.Contains(got, part) {
			t.Errorf("%q не содержит %q", got, part)
		}
	}
	if full := reasonText(b, 5, 1); !strings.Contains(full, "всю партию") {
		t.Errorf("полное покрытие должно говорить «всю партию»: %q", full)
	}
}

func TestScoreHotOffers_TieBrokenByName(t *testing.T) {
	dishes := []hotDish{
		dish("Б-блюдо", 5, ing("x", 100)),
		dish("А-блюдо", 5, ing("y", 100)),
	}
	batches := []hotBatch{batch("1", "x", 500, 10), batch("2", "y", 500, 10)}
	got := scoreHotOffers(dishes, batches, t0, 10)
	if len(got) != 2 || got[0].Score != got[1].Score {
		t.Fatalf("ожидали два блюда с равным баллом: %+v", got)
	}
	if got[0].Name != "А-блюдо" {
		t.Errorf("при равенстве порядок по имени: первым %q", got[0].Name)
	}
}

func TestScoreHotOffers_NonPositiveLimitMeansNoLimit(t *testing.T) {
	var dishes []hotDish
	var batches []hotBatch
	for i := 0; i < 15; i++ {
		p := fmt.Sprintf("p%d", i)
		dishes = append(dishes, dish("d"+p, 5, ing(p, 100)))
		batches = append(batches, batch("b"+p, p, 500, 10))
	}
	if got := scoreHotOffers(dishes, batches, t0, 0); len(got) != 15 {
		t.Errorf("limit=0 → без ограничения, получили %d", len(got))
	}
}

func TestScoreHotOffers_ZeroConsumptionIngredientIgnored(t *testing.T) {
	d := []hotDish{dish("A", 5, hotIngredient{productID: "x", milli: 0})}
	if got := scoreHotOffers(d, []hotBatch{batch("b", "x", 500, 5)}, t0, 10); len(got) != 0 {
		t.Errorf("ингредиент с нулевым расходом не должен давать баллов: %+v", got)
	}
}
