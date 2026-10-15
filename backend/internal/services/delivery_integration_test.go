package services

import (
	"context"
	"fmt"
	"math"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

func newDelivery(t *testing.T) (*testutil.DB, *DeliveryService) {
	t.Helper()
	d := testutil.New(t)
	return d, NewDeliveryService(d.Pool)
}

func TestDelivery_HappyPath(t *testing.T) {
	d, svc := newDelivery(t)
	milk := d.Product("Молоко", "ml")
	eggs := d.Product("Яйцо", "pcs")
	date := time.Now().Add(-2 * time.Hour).UTC().Truncate(time.Second)

	resp, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
		Number:       "D-1",
		DeliveryDate: &date,
		Items: []models.DeliveryItemInput{
			{ProductID: milk, Quantity: 5000, ShelfLifeHours: 72},
			{ProductID: eggs, Quantity: 30, ShelfLifeHours: 336},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	if resp.ID == "" || resp.Number != "D-1" || !resp.DeliveryDate.Equal(date) {
		t.Errorf("ответ: %+v", resp)
	}
	if len(resp.Batches) != 2 {
		t.Fatalf("партий в ответе %d, ожидали 2", len(resp.Batches))
	}

	b := resp.Batches[0]
	if b.Product != "Молоко" || b.Unit != "ml" || b.Quantity != 5000 || b.ShelfLifeHours != 72 || b.ProductID != milk {
		t.Errorf("партия молока: %+v", b)
	}
	if !b.ReceivedAt.Equal(date) || !b.ExpiresAt.Equal(date.Add(72*time.Hour)) {
		t.Errorf("сроки партии: received=%v expires=%v", b.ReceivedAt, b.ExpiresAt)
	}

	// В БД: expires_at = received_at + shelf_life ровно, остаток = начальному количеству.
	if n := d.Count("batches", "expires_at <> received_at + shelf_life"); n != 0 {
		t.Errorf("у %d партий expires_at ≠ received_at + shelf_life", n)
	}
	if n := d.Count("batches", "remaining_quantity <> initial_quantity OR status <> 'active'"); n != 0 {
		t.Errorf("%d партий созданы не полными/активными", n)
	}
	if got := d.Float(`SELECT extract(epoch FROM shelf_life)::float8 / 3600 FROM batches WHERE id = $1::uuid`, b.ID); got != 72 {
		t.Errorf("shelf_life в БД = %v ч, ожидали 72", got)
	}

	// Журнал: по одной записи receipt на партию, без привязки к заказу.
	if n := d.Count("stock_movements", "type = 'receipt' AND order_id IS NULL"); n != 2 {
		t.Errorf("записей receipt: %d, ожидали 2", n)
	}
	if got := d.MovementSum("receipt"); got != 5030 {
		t.Errorf("сумма приходов %v, ожидали 5030", got)
	}
	d.AssertInvariants()

	if got := d.Stock(milk); got != 5000 {
		t.Errorf("остаток молока %v, ожидали 5000", got)
	}
}

func TestDelivery_GeneratedNumber(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	item := []models.DeliveryItemInput{{ProductID: p, Quantity: 1, ShelfLifeHours: 1}}

	for _, number := range []string{"", "   "} {
		d.Exec(`DELETE FROM stock_movements; DELETE FROM batches; DELETE FROM deliveries;`)
		resp, err := svc.Create(context.Background(), models.CreateDeliveryRequest{Number: number, Items: item})
		if err != nil {
			t.Fatal(err)
		}
		if ok, _ := regexp.MatchString(`^D-\d{8}-\d{6}-\d{4}$`, resp.Number); !ok {
			t.Errorf("number=%q → сгенерирован %q, ожидали D-YYYYMMDD-HHMMSS-NNNN", number, resp.Number)
		}
	}
}

func TestDelivery_NumberIsTrimmed(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	resp, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
		Number: "  D-7  ", Items: []models.DeliveryItemInput{{ProductID: p, Quantity: 1, ShelfLifeHours: 1}},
	})
	if err != nil || resp.Number != "D-7" {
		t.Fatalf("%v, %+v", err, resp)
	}
}

func TestDelivery_DefaultDateIsNow(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	before := time.Now()
	resp, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
		Items: []models.DeliveryItemInput{{ProductID: p, Quantity: 1, ShelfLifeHours: 24}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.DeliveryDate.Before(before.Add(-time.Second)) || resp.DeliveryDate.After(time.Now().Add(time.Second)) {
		t.Errorf("delivery_date = %v, ожидали ≈ сейчас", resp.DeliveryDate)
	}
	// Go хранит наносекунды, Postgres — микросекунды, поэтому сравниваем с допуском.
	if diff := resp.Batches[0].ExpiresAt.Sub(resp.DeliveryDate) - 24*time.Hour; diff < -time.Millisecond || diff > time.Millisecond {
		t.Errorf("срок хранения отличается от 24 ч на %v", diff)
	}
}

func TestDelivery_SmallFutureDateTolerated(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	date := time.Now().Add(2 * time.Minute) // расхождение часов клиента и сервера допустимо
	if _, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
		DeliveryDate: &date, Items: []models.DeliveryItemInput{{ProductID: p, Quantity: 1, ShelfLifeHours: 1}},
	}); err != nil {
		t.Fatalf("дата на 2 минуты вперёд должна приниматься: %v", err)
	}
}

func TestDelivery_DuplicateNumberConflict(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	req := models.CreateDeliveryRequest{Number: "D-1", Items: []models.DeliveryItemInput{{ProductID: p, Quantity: 5, ShelfLifeHours: 10}}}

	if _, err := svc.Create(context.Background(), req); err != nil {
		t.Fatal(err)
	}
	req.Number = " D-1 " // после обрезки пробелов номер тот же
	_, err := svc.Create(context.Background(), req)
	ce, ok := err.(*ConflictError)
	if !ok {
		t.Fatalf("ожидали *ConflictError, получили %T: %v", err, err)
	}
	if ce.Msg == "" {
		t.Error("пустое сообщение конфликта")
	}
	if d.Count("deliveries") != 1 || d.Count("batches") != 1 || d.Count("stock_movements") != 1 {
		t.Error("повторная поставка не должна оставлять следов")
	}
	if got := d.Stock(p); got != 5 {
		t.Errorf("остаток %v, ожидали 5 (не удвоился)", got)
	}
}

func TestDelivery_UnknownProductIsAtomic(t *testing.T) {
	d, svc := newDelivery(t)
	good := d.Product("Мука", "g")

	cases := map[string]string{
		"несуществующий uuid": "00000000-0000-0000-0000-000000000000",
		"невалидный uuid":     "not-a-uuid",
	}
	for name, bad := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
				Number: "D-BAD",
				Items: []models.DeliveryItemInput{
					{ProductID: good, Quantity: 100, ShelfLifeHours: 10}, // первая позиция корректна
					{ProductID: bad, Quantity: 1, ShelfLifeHours: 10},
				},
			})
			ve := asValidation(t, err)
			if !regexp.MustCompile(`позиция 2`).MatchString(ve.Msg) {
				t.Errorf("в сообщении нет номера позиции: %q", ve.Msg)
			}
			// Атомарность: от первой (корректной) позиции не должно остаться ничего.
			if d.Count("deliveries") != 0 || d.Count("batches") != 0 || d.Count("stock_movements") != 0 {
				t.Error("транзакция не откатилась: остались поставка/партии/движения")
			}
		})
	}
}

func TestDelivery_SameProductTwiceMakesTwoBatches(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Молоко", "ml")
	resp, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
		Items: []models.DeliveryItemInput{
			{ProductID: p, Quantity: 1000, ShelfLifeHours: 24},
			{ProductID: p, Quantity: 2000, ShelfLifeHours: 168},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Batches) != 2 || resp.Batches[0].ID == resp.Batches[1].ID {
		t.Fatalf("ожидали 2 разные партии: %+v", resp.Batches)
	}
	if got := d.Stock(p); got != 3000 {
		t.Errorf("остаток %v, ожидали 3000", got)
	}
	if !resp.Batches[0].ExpiresAt.Before(resp.Batches[1].ExpiresAt) {
		t.Error("у партий должны быть разные сроки годности")
	}
}

func TestDelivery_FractionalQuantitiesAreExact(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Специя", "g")
	resp, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
		Items: []models.DeliveryItemInput{
			{ProductID: p, Quantity: 0.125, ShelfLifeHours: 10},
			{ProductID: p, Quantity: 1234.567, ShelfLifeHours: 10},
			{ProductID: p, Quantity: 0.001, ShelfLifeHours: 10}, // минимально возможное количество
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []float64{0.125, 1234.567, 0.001}
	for i, b := range resp.Batches {
		if b.Quantity != want[i] {
			t.Errorf("партия %d в ответе: %v, ожидали %v", i, b.Quantity, want[i])
		}
		if got := d.Remaining(b.ID); got != want[i] {
			t.Errorf("партия %d в БД: %v, ожидали %v", i, got, want[i])
		}
	}
	d.AssertInvariants()
}

func TestDelivery_PastDateMayProduceAlreadyExpiredBatch(t *testing.T) {
	// Поставку «задним числом» принимаем (учёт), но такая партия сразу не считается в остатках.
	d, svc := newDelivery(t)
	p := d.Product("Сливки", "ml")
	date := time.Now().Add(-100 * time.Hour)
	resp, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
		DeliveryDate: &date, Items: []models.DeliveryItemInput{{ProductID: p, Quantity: 500, ShelfLifeHours: 24}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !resp.Batches[0].ExpiresAt.Before(time.Now()) {
		t.Fatal("партия должна быть уже просрочена")
	}
	if got := d.Stock(p); got != 0 {
		t.Errorf("просроченная партия не должна попадать в остаток: %v", got)
	}
	if got := d.BatchStatus(resp.Batches[0].ID); got != "active" {
		t.Errorf("статус %q: списание делает воркер, а не приём поставки", got)
	}
}

func TestDelivery_LiftsStoplist(t *testing.T) {
	d, svc := newDelivery(t)
	bacon := d.Product("Бекон", "g")
	carbonara := d.Dish("Карбонара", 490, testutil.Ing{Product: bacon, Qty: 100})

	if d.Portions(carbonara) != 0 {
		t.Fatal("до поставки блюдо должно быть в стоп-листе")
	}
	if _, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
		Items: []models.DeliveryItemInput{{ProductID: bacon, Quantity: 250, ShelfLifeHours: 48}},
	}); err != nil {
		t.Fatal(err)
	}
	if got := d.Portions(carbonara); got != 2 {
		t.Errorf("после поставки 250 г порций %d, ожидали 2", got)
	}
}

func TestDelivery_ConcurrentSameNumber(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	req := models.CreateDeliveryRequest{Number: "D-RACE", Items: []models.DeliveryItemInput{{ProductID: p, Quantity: 10, ShelfLifeHours: 10}}}

	const n = 8
	var wg sync.WaitGroup
	start := make(chan struct{})
	results := make(chan error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := svc.Create(context.Background(), req)
			results <- err
		}()
	}
	close(start)
	wg.Wait()
	close(results)

	var ok, conflicts, other int
	for err := range results {
		switch err.(type) {
		case nil:
			ok++
		case *ConflictError:
			conflicts++
		default:
			other++
			t.Errorf("неожиданная ошибка: %v", err)
		}
	}
	if ok != 1 || conflicts != n-1 || other != 0 {
		t.Errorf("успехов %d, конфликтов %d, прочих %d; ожидали 1 / %d / 0", ok, conflicts, other, n-1)
	}
	if d.Count("deliveries") != 1 || d.Count("batches") != 1 {
		t.Errorf("в БД поставок %d, партий %d; ожидали по 1", d.Count("deliveries"), d.Count("batches"))
	}
	d.AssertInvariants()
}

func TestDelivery_MaxItems(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	items := make([]models.DeliveryItemInput, maxDeliveryItems)
	for i := range items {
		items[i] = models.DeliveryItemInput{ProductID: p, Quantity: 1, ShelfLifeHours: float64(i + 1)}
	}
	resp, err := svc.Create(context.Background(), models.CreateDeliveryRequest{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Batches) != maxDeliveryItems || d.Count("batches") != int64(maxDeliveryItems) {
		t.Errorf("партий %d / %d", len(resp.Batches), d.Count("batches"))
	}
	d.AssertInvariants()
}

func TestDelivery_CancelledContext(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := svc.Create(ctx, models.CreateDeliveryRequest{Items: []models.DeliveryItemInput{{ProductID: p, Quantity: 1, ShelfLifeHours: 1}}})
	if err == nil {
		t.Fatal("с отменённым контекстом ожидали ошибку")
	}
	if _, ok := err.(*ValidationError); ok {
		t.Errorf("отмена контекста — не ошибка валидации: %v", err)
	}
	if d.Count("deliveries") != 0 {
		t.Error("ничего не должно быть записано")
	}
}

// ---------------- Новые правила валидации ----------------

func oneItem(number, product string, qty, shelfHours float64) models.CreateDeliveryRequest {
	return models.CreateDeliveryRequest{
		Number: number,
		Items:  []models.DeliveryItemInput{{ProductID: product, Quantity: qty, ShelfLifeHours: shelfHours}},
	}
}

// Лимит количества зависит от единицы продукта: г/мл — 100 000, шт — 1000.
func TestDelivery_QuantityLimitPerUnit(t *testing.T) {
	d, svc := newDelivery(t)
	cases := []struct {
		unit  string
		limit float64
		over  float64
	}{
		{"g", maxQtyG, maxQtyG + 0.001},
		{"ml", maxQtyMl, maxQtyMl + 0.001},
		{"pcs", maxQtyPcs, maxQtyPcs + 1},
	}
	for _, c := range cases {
		t.Run(c.unit, func(t *testing.T) {
			p := d.Product("Продукт-"+c.unit, c.unit)
			if _, err := svc.Create(context.Background(), oneItem("LIM-OK-"+c.unit, p, c.limit, 24)); err != nil {
				t.Errorf("ровно лимит (%v %s) должен приниматься: %v", c.limit, c.unit, err)
			}
			_, err := svc.Create(context.Background(), oneItem("LIM-OVER-"+c.unit, p, c.over, 24))
			ve := asValidation(t, err)
			if !strings.Contains(ve.Msg, "не может превышать") || !strings.Contains(ve.Msg, c.unit) {
				t.Errorf("сообщение: %q", ve.Msg)
			}
		})
	}
}

func TestDelivery_PiecesMustBeWhole(t *testing.T) {
	d, svc := newDelivery(t)
	eggs := d.Product("Яйцо", "pcs")
	flour := d.Product("Мука", "g")

	ve := asValidation(t, func() error {
		_, err := svc.Create(context.Background(), oneItem("PCS-BAD", eggs, 2.5, 24))
		return err
	}())
	if !strings.Contains(ve.Msg, "целым") {
		t.Errorf("сообщение: %q", ve.Msg)
	}
	if _, err := svc.Create(context.Background(), oneItem("PCS-OK", eggs, 3, 24)); err != nil {
		t.Errorf("целые штуки должны приниматься: %v", err)
	}
	// А дробные граммы — можно.
	if _, err := svc.Create(context.Background(), oneItem("G-FRAC", flour, 2.5, 24)); err != nil {
		t.Errorf("дробные граммы должны приниматься: %v", err)
	}
	if d.Count("deliveries") != 2 {
		t.Errorf("поставок %d, ожидали 2 (отклонённая не сохранена)", d.Count("deliveries"))
	}
}

func TestDelivery_LimitViolationIsAtomic(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	_, err := svc.Create(context.Background(), models.CreateDeliveryRequest{
		Number: "ATOMIC-LIMIT",
		Items: []models.DeliveryItemInput{
			{ProductID: p, Quantity: 100, ShelfLifeHours: 10},
			{ProductID: p, Quantity: maxQtyG + 1, ShelfLifeHours: 10}, // превышает лимит — откат всей поставки
		},
	})
	asValidation(t, err)
	if d.Count("deliveries") != 0 || d.Count("batches") != 0 || d.Count("stock_movements") != 0 {
		t.Error("поставка с нарушением лимита во второй позиции не должна оставлять следов")
	}
}

// Заведомо абсурдные количества отклоняются на любой архитектуре
// (переполнение float → int64 в Go зависит от платформы).
func TestDelivery_AbsurdQuantitiesRejected(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Мука", "g")
	for _, q := range []float64{1e15, 1e18, 1e20, 1e300, math.MaxFloat64, math.Inf(1)} {
		t.Run(fmt.Sprint(q), func(t *testing.T) {
			_, err := svc.Create(context.Background(), oneItem("", p, q, 24))
			asValidation(t, err)
		})
	}
	if d.Count("deliveries") != 0 {
		t.Error("ничего не должно быть сохранено")
	}
}

func TestDelivery_ShelfLifeBoundaries(t *testing.T) {
	d, svc := newDelivery(t)
	p := d.Product("Консервы", "g")

	resp, err := svc.Create(context.Background(), oneItem("SHELF-MAX", p, 10, maxShelfLifeHours))
	if err != nil {
		t.Fatalf("срок ровно в год должен приниматься: %v", err)
	}
	// Go хранит наносекунды, Postgres — микросекунды: сравниваем с допуском в миллисекунду.
	if diff := resp.Batches[0].ExpiresAt.Sub(resp.DeliveryDate) - 24*365*time.Hour; diff < -time.Millisecond || diff > time.Millisecond {
		t.Errorf("срок хранения отличается от года на %v", diff)
	}
	if _, err := svc.Create(context.Background(), oneItem("SHELF-MIN", p, 10, 1)); err != nil {
		t.Errorf("минимальный срок 1 ч должен приниматься: %v", err)
	}
}
