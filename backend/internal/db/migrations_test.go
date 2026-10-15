package db_test

import (
	"testing"

	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

const schemaObjects = `SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema()`

func TestMigrations_UpDownUp(t *testing.T) {
	d := testutil.NewBare(t)
	versions := d.MigrationVersions()
	if len(versions) < 3 {
		t.Fatalf("ожидали минимум 3 миграции, нашли %v", versions)
	}

	d.ApplyUp(0)
	if n := d.Int(schemaObjects); n < 10 {
		t.Fatalf("после up в схеме %d объектов, ожидали ≥ 10 (таблицы + view)", n)
	}

	// Откат в обратном порядке должен оставить пустую схему.
	for i := len(versions) - 1; i >= 0; i-- {
		d.ApplyDown(versions[i])
	}
	if n := d.Int(schemaObjects); n != 0 {
		t.Fatalf("после полного down в схеме осталось %d объектов", n)
	}

	// И накатываться заново без ошибок.
	d.ApplyUp(0)
	if n := d.Count("products"); n != 10 {
		t.Fatalf("после повторного up продуктов %d, ожидали 10", n)
	}
}

func TestMigrations_EachStepAppliesIndependently(t *testing.T) {
	d := testutil.NewBare(t)
	d.ApplyStep(1)
	if n := d.Count("products"); n != 0 {
		t.Fatalf("после 000001 данных быть не должно, продуктов: %d", n)
	}
	d.ApplyStep(2)
	if d.Count("dishes") != 6 || d.Count("batches") != 0 {
		t.Fatal("после 000002 должны быть блюда, но ещё нет партий")
	}
	d.ApplyStep(3)
	if d.Count("batches") == 0 {
		t.Fatal("после 000003 должны появиться партии")
	}
	d.ApplyStep(4)
	if n := d.Int(`SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'orders' AND column_name = 'revenue'`); n != 1 {
		t.Fatal("после 000004 должна появиться колонка orders.revenue")
	}
}

func TestSeed_Contents(t *testing.T) {
	d := testutil.NewSeeded(t)

	counts := map[string]int64{
		"products":         10,
		"dishes":           6,
		"dish_ingredients": 17,
		"deliveries":       3,
		"batches":          13,
	}
	for table, want := range counts {
		if got := d.Count(table); got != want {
			t.Errorf("%s: %d строк, ожидали %d", table, got, want)
		}
	}
	if got := d.Count("stock_movements", "type = 'receipt'"); got != 13 {
		t.Errorf("записей receipt: %d, ожидали 13 (по одной на партию)", got)
	}

	// Каждая партия: активна, цела, срок = получение + срок хранения.
	if n := d.Count("batches", "status <> 'active' OR remaining_quantity <> initial_quantity"); n != 0 {
		t.Errorf("%d партий сида не активны или частично израсходованы", n)
	}
	if n := d.Count("batches", "expires_at <> received_at + shelf_life"); n != 0 {
		t.Errorf("у %d партий expires_at ≠ received_at + shelf_life", n)
	}
	if n := d.Count("batches", "expires_at <= now()"); n != 0 {
		t.Errorf("%d партий сида уже просрочены сразу после накатки", n)
	}
	d.AssertInvariants()
}

func TestSeed_StoplistScenario(t *testing.T) {
	d := testutil.NewSeeded(t)

	// Бекона в сиде нет — «Паста Карбонара» должна быть единственной в стоп-листе.
	if got := d.Stock(d.Str(`SELECT id::text FROM products WHERE name = 'Бекон'`)); got != 0 {
		t.Errorf("остаток бекона %v, ожидали 0", got)
	}
	if got := d.Count("dish_availability", "portions = 0"); got != 1 {
		t.Errorf("в стоп-листе %d блюд, ожидали 1", got)
	}
	if name := d.Str(`SELECT name FROM dish_availability WHERE portions = 0`); name != "Паста Карбонара" {
		t.Errorf("в стоп-листе %q, ожидали «Паста Карбонара»", name)
	}
	if got := d.Count("dish_availability", "portions > 0"); got != 5 {
		t.Errorf("доступно %d блюд, ожидали 5", got)
	}
}

func TestSeed_HasExpiringBatches(t *testing.T) {
	d := testutil.NewSeeded(t)
	// Сценарий для демо: есть партии, истекающие в ближайшие сутки.
	if n := d.Count("batches", "expires_at < now() + interval '24 hours'"); n < 2 {
		t.Errorf("партий, истекающих за сутки: %d, ожидали ≥ 2", n)
	}
}

func TestSeedDown_RemovesOnlySeedDeliveries(t *testing.T) {
	d := testutil.NewSeeded(t)
	product := d.Str(`SELECT id::text FROM products WHERE name = 'Мука'`)
	d.Batch(product, 100, 10) // партия не из сида

	d.ApplyDown(3)

	if got := d.Count("deliveries"); got != 1 {
		t.Errorf("после down 000003 осталось %d поставок, ожидали 1 (не сидовая)", got)
	}
	if got := d.Count("batches"); got != 1 {
		t.Errorf("после down 000003 осталось %d партий, ожидали 1", got)
	}
	if got := d.Count("stock_movements"); got != 1 {
		t.Errorf("после down 000003 осталось %d движений, ожидали 1", got)
	}
	d.AssertInvariants()
}
