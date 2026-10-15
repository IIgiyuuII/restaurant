package db_test

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

const (
	checkViolation  = "23514"
	uniqueViolation = "23505"
	fkViolation     = "23503"
)

func sqlState(err error) string {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.Code
	}
	return ""
}

// ---------- Ограничения схемы: защищают данные от ошибок в коде ----------

func TestSchema_Constraints(t *testing.T) {
	d := testutil.New(t)
	prod := d.Product("Мука", "g")
	dish := d.Dish("Блин", 100, testutil.Ing{Product: prod, Qty: 50})
	batch := d.Batch(prod, 100, 10)
	delivery := d.Str(`SELECT delivery_id::text FROM batches WHERE id = $1::uuid`, batch)
	order := d.Str(`INSERT INTO orders DEFAULT VALUES RETURNING id::text`)

	insertBatch := func(initial, remaining, shelfHours, expiresOffsetHours string) string {
		return `INSERT INTO batches (delivery_id, product_id, initial_quantity, remaining_quantity, shelf_life, received_at, expires_at)
		        VALUES ('` + delivery + `', '` + prod + `', ` + initial + `, ` + remaining + `,
		                interval '` + shelfHours + ` hours', now(), now() + interval '` + expiresOffsetHours + ` hours')`
	}

	cases := []struct {
		name string
		sql  string
		want string
	}{
		{"unit вне g/ml/pcs", `INSERT INTO products (name, unit) VALUES ('X', 'kg')`, checkViolation},
		{"дубликат названия продукта", `INSERT INTO products (name, unit) VALUES ('Мука', 'g')`, uniqueViolation},
		{"дубликат номера поставки", `INSERT INTO deliveries (number) SELECT number FROM deliveries LIMIT 1`, uniqueViolation},
		{"initial_quantity = 0", insertBatch("0", "0", "1", "1"), checkViolation},
		{"отрицательный остаток", insertBatch("10", "-1", "1", "1"), checkViolation},
		{"остаток больше начального", insertBatch("10", "11", "1", "1"), checkViolation},
		{"expires_at раньше received_at", insertBatch("10", "10", "1", "-1"), checkViolation},
		{"expires_at = received_at", `INSERT INTO batches (delivery_id, product_id, initial_quantity, remaining_quantity, shelf_life, received_at, expires_at)
		   VALUES ('` + delivery + `', '` + prod + `', 1, 1, interval '1 hour', '2030-01-01', '2030-01-01')`, checkViolation},
		{"неизвестный статус партии", `UPDATE batches SET status = 'lost'`, checkViolation},
		{"партия с несуществующим продуктом", `INSERT INTO batches (delivery_id, product_id, initial_quantity, remaining_quantity, shelf_life, expires_at)
		   VALUES ('` + delivery + `', gen_random_uuid(), 1, 1, interval '1 hour', now() + interval '1 hour')`, fkViolation},
		{"отрицательная цена блюда", `INSERT INTO dishes (name, price) VALUES ('Y', -1)`, checkViolation},
		{"дубликат названия блюда", `INSERT INTO dishes (name, price) VALUES ('Блин', 1)`, uniqueViolation},
		{"расход ингредиента = 0", `INSERT INTO dish_ingredients VALUES ('` + dish + `', gen_random_uuid(), 0)`, checkViolation},
		{"дубликат ингредиента в рецепте", `INSERT INTO dish_ingredients VALUES ('` + dish + `', '` + prod + `', 1)`, uniqueViolation},
		{"неизвестный статус заказа", `UPDATE orders SET status = 'cooking'`, checkViolation},
		{"позиция заказа с 0 порций", `INSERT INTO order_items (order_id, dish_id, quantity) VALUES ('` + order + `', '` + dish + `', 0)`, checkViolation},
		{"неизвестный тип движения", `INSERT INTO stock_movements (batch_id, product_id, type, delta) VALUES ('` + batch + `', '` + prod + `', 'gift', 1)`, checkViolation},
		{"поставку с партиями нельзя удалить", `DELETE FROM deliveries WHERE id = '` + delivery + `'`, fkViolation},
		{"продукт с партиями нельзя удалить", `DELETE FROM products WHERE id = '` + prod + `'`, fkViolation},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := d.TryExec(c.sql)
			if err == nil {
				t.Fatalf("ожидали нарушение ограничения %s, запрос прошёл", c.want)
			}
			if got := sqlState(err); got != c.want {
				t.Fatalf("SQLSTATE = %s, ожидали %s (%v)", got, c.want, err)
			}
		})
	}
}

func TestSchema_DishDeleteCascadesIngredients(t *testing.T) {
	d := testutil.New(t)
	prod := d.Product("Мука", "g")
	dish := d.Dish("Блин", 100, testutil.Ing{Product: prod, Qty: 50})

	d.Exec(`DELETE FROM dishes WHERE id = $1::uuid`, dish)
	if n := d.Count("dish_ingredients"); n != 0 {
		t.Fatalf("рецепт удалённого блюда остался: %d строк", n)
	}
}

func TestSchema_OrderNumbersAutoIncrement(t *testing.T) {
	d := testutil.New(t)
	d.Exec(`INSERT INTO orders DEFAULT VALUES`)
	d.Exec(`INSERT INTO orders DEFAULT VALUES`)
	if n := d.Int(`SELECT count(DISTINCT number) FROM orders`); n != 2 {
		t.Fatalf("номера заказов должны быть уникальными, различных: %d", n)
	}
	if err := d.TryExec(`UPDATE orders SET number = 1`); err == nil {
		t.Fatal("number — GENERATED ALWAYS, вручную менять нельзя")
	}
}

func TestSchema_DefaultsOnNewBatch(t *testing.T) {
	d := testutil.New(t)
	prod := d.Product("Мука", "g")
	batch := d.Batch(prod, 10, 5)
	if got := d.BatchStatus(batch); got != "active" {
		t.Fatalf("статус новой партии = %q, ожидали active", got)
	}
}

// ---------- View product_stock ----------

func TestView_ProductStock(t *testing.T) {
	d := testutil.New(t)
	milk := d.Product("Молоко", "ml")
	flour := d.Product("Мука", "g")
	empty := d.Product("Соль", "g")

	d.Batch(milk, 300, 5)             // живая, ближайшая
	d.Batch(milk, 700, 50)            // живая
	d.Batch(milk, 999, -1)            // просрочена по времени — не считается
	expired := d.Batch(milk, 111, 20) // status expired — не считается
	d.SetBatchStatus(expired, "expired")
	depleted := d.BatchUsed(milk, 222, 222, 30) // status depleted — не считается
	d.SetBatchStatus(depleted, "depleted")

	if got := d.Stock(milk); got != 1000 {
		t.Errorf("остаток молока %v, ожидали 1000 (300+700, без просроченных/списанных)", got)
	}
	if got := d.Stock(flour); got != 0 {
		t.Errorf("остаток муки %v, ожидали 0", got)
	}
	if got := d.Stock(empty); got != 0 {
		t.Errorf("остаток соли %v, ожидали 0", got)
	}

	// ближайший срок — только среди живых партий
	hours := d.Float(`SELECT extract(epoch FROM nearest_expiry - now())::float8 / 3600 FROM product_stock WHERE product_id = $1::uuid`, milk)
	if hours < 4.9 || hours > 5.1 {
		t.Errorf("nearest_expiry через %.2f ч, ожидали ≈ 5", hours)
	}
	if n := d.Int(`SELECT count(*) FROM product_stock WHERE nearest_expiry IS NULL`); n != 2 {
		t.Errorf("продуктов без живых партий (nearest_expiry NULL): %d, ожидали 2", n)
	}
	if n := d.Count("product_stock"); n != 3 {
		t.Errorf("в product_stock %d продуктов, ожидали 3 (даже пустые)", n)
	}
}

// ---------- View dish_availability: на нём держится стоп-лист ----------

func TestView_DishAvailability(t *testing.T) {
	d := testutil.New(t)
	cheese := d.Product("Сыр", "g")
	dough := d.Product("Тесто", "g")
	salt := d.Product("Соль", "g")

	pizza := d.Dish("Пицца", 500, testutil.Ing{Product: cheese, Qty: 150}, testutil.Ing{Product: dough, Qty: 200})
	cheeseOnly := d.Dish("Сырная тарелка", 300, testutil.Ing{Product: cheese, Qty: 40})
	fractional := d.Dish("Щепотка", 10, testutil.Ing{Product: salt, Qty: 0.5})
	noStock := d.Dish("Из ничего", 10, testutil.Ing{Product: cheese, Qty: 1}, testutil.Ing{Product: salt, Qty: 1})
	inactive := d.Dish("Снятое", 10, testutil.Ing{Product: cheese, Qty: 1})
	d.Exec(`UPDATE dishes SET is_active = false WHERE id = $1::uuid`, inactive)
	noRecipe := d.Dish("Без рецепта", 10)

	d.Batch(cheese, 1000, 50) // 1000/150 = 6.67 → 6 порций пиццы; 1000/40 = 25 порций тарелки
	d.Batch(dough, 1000, 50)  // 1000/200 = 5 порций → лимитирует пиццу
	d.Batch(salt, 2.2, 50)    // 2.2/0.5 = 4.4 → 4 порции; но «Из ничего» нужна ещё и 1 г соли → 2 порции

	cases := map[string]int64{
		pizza:      5,  // min(6, 5) — лимитирует тесто
		cheeseOnly: 25, // floor(1000/40)
		fractional: 4,  // дробный расход, floor(2.2/0.5)
		noStock:    2,  // min(floor(1000/1), floor(2.2/1))
	}
	for dish, want := range cases {
		if got := d.Portions(dish); got != want {
			t.Errorf("блюдо %s: %d порций, ожидали %d", d.Str(`SELECT name FROM dishes WHERE id = $1::uuid`, dish), got, want)
		}
	}
	if n := d.Int(`SELECT count(*) FROM dish_availability WHERE dish_id = $1::uuid`, inactive); n != 0 {
		t.Error("неактивное блюдо не должно быть в dish_availability")
	}
	if n := d.Int(`SELECT count(*) FROM dish_availability WHERE dish_id = $1::uuid`, noRecipe); n != 0 {
		t.Error("блюдо без рецепта не должно быть в dish_availability")
	}
}

func TestView_DishAvailability_MissingIngredientMeansStoplist(t *testing.T) {
	d := testutil.New(t)
	cheese := d.Product("Сыр", "g")
	bacon := d.Product("Бекон", "g")
	carbonara := d.Dish("Карбонара", 490, testutil.Ing{Product: cheese, Qty: 50}, testutil.Ing{Product: bacon, Qty: 100})

	d.Batch(cheese, 5000, 50) // сыра много, бекона нет совсем
	if got := d.Portions(carbonara); got != 0 {
		t.Fatalf("без бекона блюдо должно быть в стоп-листе, порций: %d", got)
	}

	d.Batch(bacon, 100, 50) // ровно на одну порцию
	if got := d.Portions(carbonara); got != 1 {
		t.Fatalf("после поставки бекона порций %d, ожидали 1", got)
	}

	d.Batch(bacon, 50, -2) // просроченный бекон не помогает
	if got := d.Portions(carbonara); got != 1 {
		t.Fatalf("просроченная партия изменила доступность: %d", got)
	}
}
