package services

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

const zeroUUID = "00000000-0000-0000-0000-000000000000"

func newExpiry(t *testing.T) (*testutil.DB, *ExpiryService) {
	t.Helper()
	d := testutil.New(t)
	return d, NewExpiryService(d.Pool, 15*time.Minute)
}

// ---------------- Списание ----------------

func TestWriteOff_AllExpired(t *testing.T) {
	d, svc := newExpiry(t)
	milk := d.Product("Молоко", "ml")
	meat := d.Product("Мясо", "g")

	e1 := d.Batch(milk, 1000, -1)
	e2 := d.Batch(meat, 500, -30)
	live := d.Batch(milk, 700, 10)

	res, err := svc.WriteOffExpired(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.WrittenOff != 2 || len(res.Items) != 2 {
		t.Fatalf("списано %d, items %d; ожидали 2", res.WrittenOff, len(res.Items))
	}

	got := map[string]models.ExpiredItem{}
	for _, it := range res.Items {
		got[it.BatchID] = it
	}
	if it := got[e1]; it.Product != "Молоко" || it.Unit != "ml" || it.Quantity != 1000 || it.ProductID != milk {
		t.Errorf("списание молока: %+v", it)
	}
	if it := got[e2]; it.Product != "Мясо" || it.Quantity != 500 {
		t.Errorf("списание мяса: %+v", it)
	}

	for _, b := range []string{e1, e2} {
		if d.BatchStatus(b) != "expired" || d.Remaining(b) != 0 {
			t.Errorf("партия %s: статус %q, остаток %v", b, d.BatchStatus(b), d.Remaining(b))
		}
	}
	if d.BatchStatus(live) != "active" || d.Remaining(live) != 700 {
		t.Error("живая партия не должна затрагиваться")
	}
	if got := d.MovementSum("expired_writeoff"); got != -1500 {
		t.Errorf("сумма списаний в журнале %v, ожидали -1500", got)
	}
	if d.Count("stock_movements", "type='expired_writeoff' AND order_id IS NULL") != 2 {
		t.Error("ожидали 2 записи expired_writeoff без заказа")
	}
	if got := d.Stock(milk); got != 700 {
		t.Errorf("остаток молока %v, ожидали 700", got)
	}
	d.AssertInvariants()
}

func TestWriteOff_PartiallyUsedBatchWritesOffRemainderOnly(t *testing.T) {
	d, svc := newExpiry(t)
	p := d.Product("Мука", "g")
	b := d.BatchUsed(p, 1000, 400, -2) // из 1000 г израсходовано 400, остаток 600 просрочился

	res, err := svc.WriteOffExpired(context.Background(), nil)
	if err != nil || res.WrittenOff != 1 {
		t.Fatalf("%v %+v", err, res)
	}
	if res.Items[0].Quantity != 600 {
		t.Errorf("списано %v, ожидали 600 (только остаток)", res.Items[0].Quantity)
	}
	if got := d.MovementSum("expired_writeoff"); got != -600 {
		t.Errorf("в журнале %v", got)
	}
	if d.Remaining(b) != 0 {
		t.Error("остаток должен обнулиться")
	}
	d.AssertInvariants() // 1000 (приход) − 400 (расход) − 600 (списание) = 0
}

func TestWriteOff_SkipsDepletedAlreadyExpiredAndLive(t *testing.T) {
	d, svc := newExpiry(t)
	p := d.Product("Сыр", "g")

	depleted := d.BatchUsed(p, 100, 100, -5)
	d.SetBatchStatus(depleted, "depleted")
	already := d.Batch(p, 100, -5)
	d.SetBatchStatus(already, "expired")
	d.Exec(`UPDATE batches SET remaining_quantity = 0 WHERE id = $1::uuid`, already)
	d.Batch(p, 100, 5) // живая

	res, err := svc.WriteOffExpired(context.Background(), nil)
	if err != nil || res.WrittenOff != 0 || len(res.Items) != 0 {
		t.Fatalf("списывать нечего: %v %+v", err, res)
	}
	if res.Items == nil {
		t.Error("items должен быть пустым массивом, а не null")
	}
}

func TestWriteOff_IsIdempotent(t *testing.T) {
	d, svc := newExpiry(t)
	p := d.Product("Сыр", "g")
	d.Batch(p, 100, -1)

	first, err := svc.WriteOffExpired(context.Background(), nil)
	second, err2 := svc.WriteOffExpired(context.Background(), nil)
	if err != nil || err2 != nil {
		t.Fatal(err, err2)
	}
	if first.WrittenOff != 1 || second.WrittenOff != 0 {
		t.Errorf("первый вызов %d, второй %d; ожидали 1 и 0", first.WrittenOff, second.WrittenOff)
	}
	if d.Count("stock_movements", "type='expired_writeoff'") != 1 {
		t.Error("двойного списания в журнале быть не должно")
	}
}

func TestWriteOff_ByIDs(t *testing.T) {
	d, svc := newExpiry(t)
	p := d.Product("Сыр", "g")
	a := d.Batch(p, 100, -1)
	b := d.Batch(p, 200, -2)
	live := d.Batch(p, 300, 5)

	// a — просрочена; live — нет (молча пропускается); неизвестный uuid — тоже пропускается; дубль a не списывается дважды.
	res, err := svc.WriteOffExpired(context.Background(), []string{a, live, zeroUUID, a})
	if err != nil {
		t.Fatal(err)
	}
	if res.WrittenOff != 1 || res.Items[0].BatchID != a {
		t.Fatalf("списать должны были только %s: %+v", a, res)
	}
	if d.BatchStatus(b) != "active" || d.Remaining(b) != 200 {
		t.Error("партия, которой не было в списке, не должна списываться")
	}
	if d.BatchStatus(live) != "active" {
		t.Error("непросроченную партию списать по id нельзя")
	}
	d.AssertInvariants()
}

func TestWriteOff_UppercaseAndSpacedIDsAccepted(t *testing.T) {
	d, svc := newExpiry(t)
	p := d.Product("Сыр", "g")
	a := d.Batch(p, 100, -1)
	res, err := svc.WriteOffExpired(context.Background(), []string{"  " + strings.ToUpper(a) + " "})
	if err != nil || res.WrittenOff != 1 {
		t.Fatalf("%v %+v", err, res)
	}
}

func TestWriteOff_InvalidIDIsValidationError(t *testing.T) {
	d, svc := newExpiry(t)
	p := d.Product("Сыр", "g")
	good := d.Batch(p, 100, -1)

	_, err := svc.WriteOffExpired(context.Background(), []string{good, "не-uuid"})
	ve := asValidation(t, err)
	if !strings.Contains(ve.Msg, "batch_id") {
		t.Errorf("сообщение: %q", ve.Msg)
	}
	// И корректная партия из того же запроса не должна быть списана (транзакция откатилась).
	if d.BatchStatus(good) != "active" || d.Count("stock_movements", "type='expired_writeoff'") != 0 {
		t.Error("при ошибке валидации списание не должно частично выполняться")
	}
}

func TestWriteOff_Concurrent_EachBatchOnce(t *testing.T) {
	d, svc := newExpiry(t)
	p := d.Product("Молоко", "ml")
	const batches = 5
	for i := 0; i < batches; i++ {
		d.Batch(p, float64(100*(i+1)), -float64(i+1))
	}

	const workers = 10
	var wg sync.WaitGroup
	start := make(chan struct{})
	counts := make(chan int, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			res, err := svc.WriteOffExpired(context.Background(), nil)
			if err != nil {
				t.Errorf("ошибка: %v", err)
				counts <- 0
				return
			}
			counts <- res.WrittenOff
		}()
	}
	close(start)
	wg.Wait()
	close(counts)

	total := 0
	for c := range counts {
		total += c
	}
	if total != batches {
		t.Errorf("суммарно списано %d партий, ожидали ровно %d", total, batches)
	}
	if n := d.Count("stock_movements", "type='expired_writeoff'"); n != batches {
		t.Errorf("записей списания %d, ожидали %d (без дублей)", n, batches)
	}
	if got := d.MovementSum("expired_writeoff"); got != -1500 {
		t.Errorf("сумма списаний %v, ожидали -1500", got)
	}
	d.AssertInvariants()
}

func TestWriteOff_ClosedPoolReturnsError(t *testing.T) {
	d, svc := newExpiry(t)
	d.Pool.Close()
	_, err := svc.WriteOffExpired(context.Background(), nil)
	if err == nil {
		t.Fatal("ожидали ошибку")
	}
	if _, ok := err.(*ValidationError); ok {
		t.Errorf("сбой БД — не ошибка валидации: %v", err)
	}
}

// ---------------- Фоновый воркер ----------------

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("не дождались: %s", what)
}

func TestRunAutoWriteOff_WritesOffPeriodicallyAndStopsOnCancel(t *testing.T) {
	testutil.QuietLogs(t)
	d := testutil.New(t)
	svc := NewExpiryService(d.Pool, 30*time.Millisecond)
	p := d.Product("Молоко", "ml")
	first := d.Batch(p, 100, -1)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		svc.RunAutoWriteOff(ctx)
		close(done)
	}()

	// Первая проверка выполняется сразу при старте.
	waitFor(t, "списание первой партии", func() bool { return d.BatchStatus(first) == "expired" })

	// Позже просрочилась ещё одна партия — её подхватит следующий тик.
	second := d.Batch(p, 200, -1)
	waitFor(t, "списание второй партии по тику", func() bool { return d.BatchStatus(second) == "expired" })

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("воркер не завершился после отмены контекста")
	}
	d.AssertInvariants()
}

func TestRunAutoWriteOff_SurvivesDatabaseErrors(t *testing.T) {
	testutil.QuietLogs(t)
	d := testutil.New(t)
	svc := NewExpiryService(d.Pool, 20*time.Millisecond)
	d.Pool.Close() // каждая проверка будет падать — воркер обязан не паниковать и ждать отмены

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		svc.RunAutoWriteOff(ctx)
		close(done)
	}()
	time.Sleep(120 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("воркер завис")
	}
}

// ---------------- Отчёт ----------------

// writeoff вносит в журнал списание просрочки «задним числом» (daysAgo дней назад).
func writeoff(d *testutil.DB, product string, qty, daysAgo float64) {
	d.T.Helper()
	batch := d.BatchUsed(product, qty, qty, -1) // партия уже полностью списана
	d.SetBatchStatus(batch, "expired")
	d.Exec(`INSERT INTO stock_movements (batch_id, product_id, type, delta, created_at)
	        VALUES ($1::uuid, $2::uuid, 'expired_writeoff', -$3::numeric, now() - $4::float8 * interval '1 day')`,
		batch, product, qty, daysAgo)
}

func TestReport_EmptyHasNonNilSlices(t *testing.T) {
	_, svc := newExpiry(t)
	rep, err := svc.Report(context.Background(), 0)
	if err != nil {
		t.Fatal(err)
	}
	if rep.ByProduct == nil || rep.Recent == nil {
		t.Error("by_product и recent должны быть [] а не null (фронтенд делает .map)")
	}
	if rep.TotalBatches != 0 || len(rep.ByProduct) != 0 || len(rep.Recent) != 0 {
		t.Errorf("%+v", rep)
	}
	if rep.Days != DefaultReportDays || rep.AutoCheckMinutes != 15 {
		t.Errorf("days=%d auto=%d", rep.Days, rep.AutoCheckMinutes)
	}
}

func TestReport_DaysDefaultsAndClamp(t *testing.T) {
	_, svc := newExpiry(t)
	cases := map[int]int{0: 30, -5: 30, 1: 1, 90: 90, 365: 365, 366: 365, 100000: 365}
	for in, want := range cases {
		rep, err := svc.Report(context.Background(), in)
		if err != nil {
			t.Fatal(err)
		}
		if rep.Days != want {
			t.Errorf("days=%d → %d, ожидали %d", in, rep.Days, want)
		}
	}
}

func TestReport_AutoCheckMinutesReflectsConfig(t *testing.T) {
	d := testutil.New(t)
	for every, want := range map[time.Duration]int{0: 0, time.Hour: 60, 15 * time.Minute: 15} {
		rep, err := NewExpiryService(d.Pool, every).Report(context.Background(), 7)
		if err != nil || rep.AutoCheckMinutes != want {
			t.Errorf("every=%v: %v, auto=%d, ожидали %d", every, err, rep.AutoCheckMinutes, want)
		}
	}
}

func TestReport_AggregationOrderingAndPeriod(t *testing.T) {
	d, svc := newExpiry(t)
	arbuz := d.Product("Арбуз", "g")
	beta := d.Product("Бета", "g")
	alpha := d.Product("Альфа", "g")
	meat := d.Product("Мясо", "g")
	fish := d.Product("Рыба", "g")
	old := d.Product("Старьё", "g")

	// Мясо: 3 списания → первое место по числу партий.
	writeoff(d, meat, 10, 1)
	writeoff(d, meat, 10, 2)
	writeoff(d, meat, 10, 3)
	// Рыба и Арбуз: по 2 партии; у рыбы больше количество → рыба выше арбуза.
	writeoff(d, fish, 50, 1)
	writeoff(d, fish, 40, 2)
	writeoff(d, arbuz, 5, 1)
	writeoff(d, arbuz, 5, 2)
	// Бета и Альфа: по 1 партии и равное количество → по алфавиту.
	writeoff(d, beta, 1, 1)
	writeoff(d, alpha, 1, 1)
	// Списание 40 дней назад: вне окна 30 дней.
	writeoff(d, old, 999, 40)

	rep, err := svc.Report(context.Background(), 30)
	if err != nil {
		t.Fatal(err)
	}
	var order []string
	for _, st := range rep.ByProduct {
		order = append(order, st.Name)
	}
	want := []string{"Мясо", "Рыба", "Арбуз", "Альфа", "Бета"}
	if strings.Join(order, ",") != strings.Join(want, ",") {
		t.Errorf("порядок по продуктам:\n got  %v\n want %v", order, want)
	}
	if rep.TotalBatches != 3+2+2+1+1 {
		t.Errorf("всего партий %d, ожидали 9", rep.TotalBatches)
	}
	fishStat := rep.ByProduct[1]
	if fishStat.Batches != 2 || fishStat.Quantity != 90 || fishStat.Unit != "g" || fishStat.ProductID != fish {
		t.Errorf("статистика по рыбе: %+v", fishStat)
	}

	// Расширили окно — старое списание попало в отчёт и стало первым по количеству среди равных по числу.
	wide, err := svc.Report(context.Background(), 60)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, st := range wide.ByProduct {
		if st.Name == "Старьё" && st.Quantity == 999 {
			found = true
		}
	}
	if !found || wide.TotalBatches != 10 {
		t.Errorf("при days=60 ожидали старое списание: total=%d found=%v", wide.TotalBatches, found)
	}
}

func TestReport_RecentOrderLimitAndFields(t *testing.T) {
	d, svc := newExpiry(t)
	p := d.Product("Молоко", "ml")

	// Три записи с известным порядком: чем меньше daysAgo, тем новее.
	writeoff(d, p, 300, 3)
	writeoff(d, p, 100, 1)
	writeoff(d, p, 200, 2)

	rep, err := svc.Report(context.Background(), 30)
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Recent) != 3 {
		t.Fatalf("recent: %d", len(rep.Recent))
	}
	got := []float64{rep.Recent[0].Quantity, rep.Recent[1].Quantity, rep.Recent[2].Quantity}
	if got[0] != 100 || got[1] != 200 || got[2] != 300 {
		t.Errorf("recent должен идти от новых к старым: %v", got)
	}
	r := rep.Recent[0]
	if r.ID == 0 || r.Product != "Молоко" || r.Unit != "ml" || r.ProductID != p ||
		!strings.HasPrefix(r.DeliveryNumber, "TST-") || r.CreatedAt.IsZero() || r.ExpiresAt.IsZero() {
		t.Errorf("поля записи: %+v", r)
	}
	if r.CreatedAt.Location() != time.UTC || r.ExpiresAt.Location() != time.UTC {
		t.Error("время в отчёте должно быть в UTC")
	}

	// Ограничение числа последних записей.
	for i := 0; i < reportRecentLimit+5; i++ {
		writeoff(d, p, 1, 0.1)
	}
	rep, _ = svc.Report(context.Background(), 30)
	if len(rep.Recent) != reportRecentLimit {
		t.Errorf("recent: %d, ожидали не более %d", len(rep.Recent), reportRecentLimit)
	}
	if rep.TotalBatches != 3+reportRecentLimit+5 {
		t.Errorf("total_batches учитывает все списания, а не только recent: %d", rep.TotalBatches)
	}
}

func TestReport_ReflectsRealWriteOff(t *testing.T) {
	d, svc := newExpiry(t)
	p := d.Product("Сливки", "ml")
	d.Batch(p, 250, -3)
	if _, err := svc.WriteOffExpired(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	rep, err := svc.Report(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if rep.TotalBatches != 1 || len(rep.ByProduct) != 1 || rep.ByProduct[0].Quantity != 250 || len(rep.Recent) != 1 {
		t.Errorf("отчёт после реального списания: %+v", rep)
	}
	_ = fmt.Sprint(rep)
}

func TestReport_ClosedPoolReturnsError(t *testing.T) {
	d, svc := newExpiry(t)
	d.Pool.Close()
	if _, err := svc.Report(context.Background(), 7); err == nil {
		t.Fatal("ожидали ошибку")
	}
}
