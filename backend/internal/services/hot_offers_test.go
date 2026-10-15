package services

import (
	"math"
	"testing"
	"time"
)

var t0 = time.Date(2026, 10, 12, 12, 0, 0, 0, time.UTC)

func batch(id, product string, qty float64, hoursLeft float64) hotBatch {
	return hotBatch{
		id: id, productID: product, product: product, unit: "g",
		milli:   int64(qty * 1000),
		expires: t0.Add(time.Duration(hoursLeft * float64(time.Hour))),
	}
}

func dish(id string, portions int, ing ...hotIngredient) hotDish {
	return hotDish{id: id, name: id, price: 100, portions: portions, ingredients: ing}
}

func ing(product string, perPortion float64) hotIngredient {
	return hotIngredient{productID: product, milli: int64(perPortion * 1000)}
}

func near(a, b float64) bool { return math.Abs(a-b) < 0.011 }

func TestNoAtRiskBatches_NoOffers(t *testing.T) {
	got := scoreHotOffers([]hotDish{dish("A", 10, ing("milk", 100))}, nil, t0, 10)
	if len(got) != 0 {
		t.Fatalf("ожидали пусто, получили %d", len(got))
	}
}

func TestSoonerExpiryRanksHigher(t *testing.T) {
	dishes := []hotDish{
		dish("slow", 10, ing("cheese", 100)),
		dish("urgent", 10, ing("milk", 100)),
	}
	batches := []hotBatch{
		batch("b1", "cheese", 1000, 40),
		batch("b2", "milk", 1000, 5),
	}
	got := scoreHotOffers(dishes, batches, t0, 10)
	if len(got) != 2 || got[0].DishID != "urgent" {
		t.Fatalf("первым должно быть urgent: %+v", got)
	}
	if got[0].Level != levelCritical || got[1].Level != levelMedium {
		t.Fatalf("уровни: %s, %s", got[0].Level, got[1].Level)
	}
}

func TestUrgencyHalvesEveryDay(t *testing.T) {
	if !near(urgency(0.0001), 1) || !near(urgency(24), 0.5) || !near(urgency(48), 0.25) {
		t.Fatal("срочность должна вдвое падать за каждые 24 ч")
	}
}

func TestCoverage_BigStockLowersScore(t *testing.T) {
	// Блюдо способно съесть 5 порций × 100 г = 500 г.
	d := []hotDish{dish("A", 5, ing("x", 100))}
	small := scoreHotOffers(d, []hotBatch{batch("s", "x", 500, 10)}, t0, 10)
	big := scoreHotOffers(d, []hotBatch{batch("b", "x", 10000, 10)}, t0, 10)
	if small[0].Reasons[0].CoveragePct != 100 {
		t.Fatalf("покрытие маленькой партии: %v", small[0].Reasons[0].CoveragePct)
	}
	if big[0].Reasons[0].CoveragePct != 5 {
		t.Fatalf("покрытие большой партии: %v", big[0].Reasons[0].CoveragePct)
	}
	if small[0].Score <= big[0].Score {
		t.Fatal("маленькая партия, которую блюдо способно израсходовать, должна быть приоритетнее")
	}
}

func TestShareSplitBetweenDishes(t *testing.T) {
	// Обоим хватает порций, чтобы съесть всю партию; расход 100 и 300 г → доли 25% и 75%.
	dishes := []hotDish{
		dish("light", 100, ing("x", 100)),
		dish("heavy", 100, ing("x", 300)),
	}
	got := scoreHotOffers(dishes, []hotBatch{batch("b", "x", 1000, 0.5)}, t0, 10)
	if len(got) != 2 || got[0].DishID != "heavy" {
		t.Fatalf("первым должен быть heavy: %+v", got)
	}
	u := urgency(0.5)
	if !near(got[0].Score, u*0.75) || !near(got[1].Score, u*0.25) {
		t.Fatalf("доли: %v и %v, ожидали %v и %v", got[0].Score, got[1].Score, u*0.75, u*0.25)
	}
}

func TestFEFO_CoverageAcrossTwoBatches(t *testing.T) {
	// Блюдо способно съесть 10 × 100 = 1000 г. Ранняя партия 600 г покрыта полностью,
	// на более позднюю (800 г) остаётся 400 г → 50%.
	d := []hotDish{dish("A", 10, ing("x", 100))}
	got := scoreHotOffers(d, []hotBatch{
		batch("late", "x", 800, 30),
		batch("early", "x", 600, 10),
	}, t0, 10)
	if len(got) != 1 || len(got[0].Reasons) != 2 {
		t.Fatalf("ожидали 1 блюдо и 2 причины: %+v", got)
	}
	cov := map[string]float64{}
	for _, r := range got[0].Reasons {
		cov[r.BatchID] = r.CoveragePct
	}
	if cov["early"] != 100 || cov["late"] != 50 {
		t.Fatalf("покрытие по FEFO: %+v", cov)
	}
}

func TestSecondBatchNotCoveredIfFirstTakesEverything(t *testing.T) {
	d := []hotDish{dish("A", 5, ing("x", 100))} // 500 г
	got := scoreHotOffers(d, []hotBatch{
		batch("early", "x", 500, 10),
		batch("late", "x", 500, 30),
	}, t0, 10)
	if len(got[0].Reasons) != 1 || got[0].Reasons[0].BatchID != "early" {
		t.Fatalf("поздняя партия не должна попадать в причины: %+v", got[0].Reasons)
	}
}

func TestMultipleUrgentIngredientsSum(t *testing.T) {
	dishes := []hotDish{
		dish("one", 10, ing("a", 100)),
		dish("two", 10, ing("b", 100), ing("c", 100)),
	}
	batches := []hotBatch{
		batch("1", "a", 500, 10), batch("2", "b", 500, 10), batch("3", "c", 500, 10),
	}
	got := scoreHotOffers(dishes, batches, t0, 10)
	if got[0].DishID != "two" || !near(got[0].Score, 2*got[1].Score) {
		t.Fatalf("блюдо с двумя горящими ингредиентами должно набирать вдвое больше: %+v", got)
	}
}

func TestZeroPortionsAndExpiredIgnored(t *testing.T) {
	dishes := []hotDish{dish("stop", 0, ing("x", 100)), dish("ok", 5, ing("y", 100))}
	batches := []hotBatch{batch("1", "x", 500, 5), batch("2", "y", 500, -1)}
	if got := scoreHotOffers(dishes, batches, t0, 10); len(got) != 0 {
		t.Fatalf("ожидали пусто, получили %+v", got)
	}
}

func TestLimit(t *testing.T) {
	var dishes []hotDish
	var batches []hotBatch
	for _, p := range []string{"a", "b", "c"} {
		dishes = append(dishes, dish("d"+p, 5, ing(p, 100)))
		batches = append(batches, batch("b"+p, p, 500, 10))
	}
	if got := scoreHotOffers(dishes, batches, t0, 2); len(got) != 2 {
		t.Fatalf("limit=2, получили %d", len(got))
	}
}

func TestReasonTextAndHoursFormat(t *testing.T) {
	got := scoreHotOffers([]hotDish{dish("A", 100, ing("Курица", 200))},
		[]hotBatch{batch("b", "Курица", 6000, 17.4)}, t0, 10)
	want := "Курица: партия 6000 г истекает через 17 ч — блюдо может израсходовать всю партию"
	if got[0].Summary != want {
		t.Fatalf("summary:\n got  %q\n want %q", got[0].Summary, want)
	}
	cases := map[float64]string{0.5: "30 мин", 5.5: "5 ч 30 мин", 20: "20 ч", 72: "3 дн."}
	for h, w := range cases {
		if s := formatHoursLeft(h); s != w {
			t.Errorf("formatHoursLeft(%v) = %q, ожидали %q", h, s, w)
		}
	}
}

func TestNegligibleReasonsHiddenButCounted(t *testing.T) {
	// Блюдо: основной ингредиент (полное покрытие) + «шумовой» (покрытие 2%).
	d := []hotDish{dish("A", 10, ing("main", 100), ing("noise", 10))}
	got := scoreHotOffers(d, []hotBatch{
		batch("m", "main", 1000, 10),
		batch("n", "noise", 5000, 10), // покрытие 2% → вклад ≈ 0.015
	}, t0, 10)
	if len(got[0].Reasons) != 1 || got[0].Reasons[0].BatchID != "m" {
		t.Fatalf("шумовая причина должна быть скрыта: %+v", got[0].Reasons)
	}
	// Но в балл вклад шума входит.
	if got[0].Score <= got[0].Reasons[0].Points {
		t.Fatalf("score %v должен включать скрытые вклады (основной %v)", got[0].Score, got[0].Reasons[0].Points)
	}
}
