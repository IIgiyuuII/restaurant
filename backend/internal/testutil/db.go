// Package testutil — помощники для интеграционных тестов бэкенда.
//
// Каждый тест получает ИЗОЛИРОВАННУЮ схему Postgres (t_<random>) с накатанными
// миграциями и удаляет её по завершении. Рабочие данные (схема public) не
// затрагиваются, поэтому TEST_DATABASE_URL может указывать на ту же БД, но
// лучше использовать отдельную (см. docker-compose.test.yml).
//
// Без TEST_DATABASE_URL интеграционные тесты пропускаются. Если выставлена
// TEST_REQUIRE_DB=1 (так делает CI), отсутствие БД считается ошибкой.
package testutil

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	EnvURL     = "TEST_DATABASE_URL"
	envRequire = "TEST_REQUIRE_DB"
)

// DB — тестовая БД с собственной схемой.
type DB struct {
	T      *testing.T
	Pool   *pgxpool.Pool
	Schema string
	seq    int
}

// New возвращает пустую схему с накатанной миграцией 000001 (только структура).
func New(t *testing.T) *DB {
	t.Helper()
	d := open(t)
	d.ApplyUp(1)
	return d
}

// NewSeeded возвращает схему со всеми миграциями (включая сид-данные).
func NewSeeded(t *testing.T) *DB {
	t.Helper()
	d := open(t)
	d.ApplyUp(0)
	return d
}

// NewBare возвращает пустую схему вообще без таблиц — для тестов самих миграций.
func NewBare(t *testing.T) *DB {
	t.Helper()
	return open(t)
}

// URL возвращает TEST_DATABASE_URL или пропускает (падает) тест, если он не задан.
func URL(t *testing.T) string {
	t.Helper()
	dsn := strings.TrimSpace(os.Getenv(EnvURL))
	if dsn == "" {
		if os.Getenv(envRequire) != "" {
			t.Fatalf("%s не задан, а %s требует интеграционные тесты", EnvURL, envRequire)
		}
		t.Skipf("интеграционный тест пропущен: задайте %s (отдельная тестовая БД)", EnvURL)
	}
	requireReachable(t, dsn)
	return dsn
}

var (
	reachOnce  sync.Once
	reachErr   error
	reportOnce sync.Once
)

// requireReachable один раз за процесс проверяет, что БД отвечает, и вместо десятков
// одинаковых «connection refused» выдаёт ОДНО понятное сообщение с подсказками.
func requireReachable(t *testing.T, dsn string) {
	t.Helper()
	reachOnce.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		conn, err := pgx.Connect(ctx, dsn)
		if err != nil {
			reachErr = err
			return
		}
		_ = conn.Close(ctx)
	})
	if reachErr == nil {
		return
	}
	full := false
	reportOnce.Do(func() { full = true })
	if !full {
		t.Fatal("тестовая БД недоступна (подробности и подсказки — в первой упавшей проверке)")
	}
	shown := dsn
	if u, err := url.Parse(dsn); err == nil {
		shown = u.Redacted() // пароль скрыт
	}
	t.Fatalf(`тестовая БД недоступна: %v
  адрес: %s

Что проверить:
  1. База запущена? При запуске через Docker — сам Docker Desktop должен работать
     (иконка кита, статус "Engine running"), затем:
       docker compose -f docker-compose.test.yml up -d
  2. Адрес и порт. Пишите 127.0.0.1, а не localhost: иначе Windows сначала пробует IPv6 (::1).
     Если порт занят или зарезервирован системой (ошибка "forbidden by its access permissions"),
     возьмите другой:  $env:TEST_DB_PORT = "15433"  и тот же порт в TEST_DATABASE_URL.
  3. Нет Docker? Поставьте локальный PostgreSQL 13+ и создайте базу:
       CREATE DATABASE restaurant_test;
  Подробности — в README, раздел «Тесты бэкенда».`, reachErr, shown)
}

// QuietLogs подавляет стандартный логгер на время теста. Нужен тестам, которые
// намеренно вызывают ошибки: иначе в выводе появляются «internal error: ...»,
// похожие на настоящие сбои.
func QuietLogs(t *testing.T) {
	t.Helper()
	prev := log.Writer()
	log.SetOutput(io.Discard)
	t.Cleanup(func() { log.SetOutput(prev) })
}

func open(t *testing.T) *DB {
	t.Helper()
	dsn := URL(t)
	schema := "t_" + randHex(6)
	ctx := context.Background()

	admin := connect(t, dsn, "", 2)
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quote(schema)); err != nil {
		admin.Close()
		t.Fatalf("создание схемы %s: %v", schema, err)
	}
	pool := connect(t, dsn, schema, 10)

	t.Cleanup(func() {
		pool.Close()
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA IF EXISTS "+quote(schema)+" CASCADE"); err != nil {
			t.Logf("не удалось удалить схему %s: %v", schema, err)
		}
		admin.Close()
	})
	return &DB{T: t, Pool: pool, Schema: schema}
}

// connect создаёт пул так же, как продакшен (simple protocol — этого требует
// Supabase pooler). search_path выставляется после каждого подключения.
func connect(t *testing.T, dsn, schema string, maxConns int32) *pgxpool.Pool {
	t.Helper()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("разбор %s: %v", EnvURL, err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	cfg.MaxConns = maxConns
	if schema != "" {
		cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
			_, err := c.Exec(ctx, "SET search_path TO "+quote(schema))
			return err
		}
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatalf("подключение к тестовой БД: %v", err)
	}
	return pool
}

func quote(ident string) string { return pgx.Identifier{ident}.Sanitize() }

func randHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

// ---------------- Миграции ----------------

var (
	migrationFile = regexp.MustCompile(`^(\d+)_.*\.(up|down)\.sql$`)
	// gen_random_uuid() встроен в Postgres 13+, расширение не нужно; а
	// CREATE EXTENSION в тестовой схеме мешал бы параллельным пакетам.
	extensionStmt = regexp.MustCompile(`(?im)^\s*CREATE\s+EXTENSION[^;\n]*;?[ \t\r]*$`)
)

func migrationsDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "migrations")
}

// MigrationVersions — версии всех миграций по возрастанию.
func (d *DB) MigrationVersions() []int {
	d.T.Helper()
	entries, err := os.ReadDir(migrationsDir())
	if err != nil {
		d.T.Fatalf("чтение каталога миграций: %v", err)
	}
	seen := map[int]bool{}
	for _, e := range entries {
		if m := migrationFile.FindStringSubmatch(e.Name()); m != nil {
			v, _ := strconv.Atoi(m[1])
			seen[v] = true
		}
	}
	var out []int
	for v := range seen {
		out = append(out, v)
	}
	sort.Ints(out)
	return out
}

func (d *DB) readMigration(version int, direction string) string {
	d.T.Helper()
	entries, err := os.ReadDir(migrationsDir())
	if err != nil {
		d.T.Fatalf("чтение каталога миграций: %v", err)
	}
	for _, e := range entries {
		m := migrationFile.FindStringSubmatch(e.Name())
		if m == nil || m[2] != direction {
			continue
		}
		if v, _ := strconv.Atoi(m[1]); v == version {
			b, err := os.ReadFile(filepath.Join(migrationsDir(), e.Name()))
			if err != nil {
				d.T.Fatalf("чтение %s: %v", e.Name(), err)
			}
			return extensionStmt.ReplaceAllString(string(b), "")
		}
	}
	d.T.Fatalf("нет миграции %06d (%s)", version, direction)
	return ""
}

// ApplyUp накатывает миграции вверх до версии upTo включительно (0 — все).
func (d *DB) ApplyUp(upTo int) {
	d.T.Helper()
	for _, v := range d.MigrationVersions() {
		if upTo > 0 && v > upTo {
			break
		}
		d.Exec(d.readMigration(v, "up"))
	}
}

// ApplyStep накатывает ровно одну миграцию (без предыдущих).
func (d *DB) ApplyStep(version int) {
	d.T.Helper()
	d.Exec(d.readMigration(version, "up"))
}

// ApplyDown откатывает одну миграцию.
func (d *DB) ApplyDown(version int) {
	d.T.Helper()
	d.Exec(d.readMigration(version, "down"))
}

// ---------------- Запросы ----------------

func (d *DB) Exec(sql string, args ...any) {
	d.T.Helper()
	if _, err := d.Pool.Exec(context.Background(), sql, args...); err != nil {
		d.T.Fatalf("exec: %v\nSQL: %s", err, sql)
	}
}

// TryExec возвращает ошибку вместо падения — для проверки CHECK/FK-ограничений.
func (d *DB) TryExec(sql string, args ...any) error {
	d.T.Helper()
	_, err := d.Pool.Exec(context.Background(), sql, args...)
	return err
}

func (d *DB) Int(sql string, args ...any) int64 {
	d.T.Helper()
	var v int64
	if err := d.Pool.QueryRow(context.Background(), sql, args...).Scan(&v); err != nil {
		d.T.Fatalf("query: %v\nSQL: %s", err, sql)
	}
	return v
}

// Float: в запросе приводите numeric к ::float8.
func (d *DB) Float(sql string, args ...any) float64 {
	d.T.Helper()
	var v float64
	if err := d.Pool.QueryRow(context.Background(), sql, args...).Scan(&v); err != nil {
		d.T.Fatalf("query: %v\nSQL: %s", err, sql)
	}
	return v
}

func (d *DB) Str(sql string, args ...any) string {
	d.T.Helper()
	var v string
	if err := d.Pool.QueryRow(context.Background(), sql, args...).Scan(&v); err != nil {
		d.T.Fatalf("query: %v\nSQL: %s", err, sql)
	}
	return v
}

// Count — число строк в таблице (можно с условием: Count("orders", "status='rejected'")).
func (d *DB) Count(table string, where ...string) int64 {
	d.T.Helper()
	q := "SELECT count(*) FROM " + table
	if len(where) > 0 {
		q += " WHERE " + where[0]
	}
	return d.Int(q)
}

// ---------------- Построители данных ----------------

// Ing — ингредиент в рецепте.
type Ing struct {
	Product string // id продукта
	Qty     float64
}

// Product создаёт продукт (unit: g | ml | pcs) и возвращает его id.
func (d *DB) Product(name, unit string, minStock ...float64) string {
	d.T.Helper()
	min := 0.0
	if len(minStock) > 0 {
		min = minStock[0]
	}
	return d.Str(`INSERT INTO products (name, unit, min_stock) VALUES ($1, $2, $3::numeric) RETURNING id::text`,
		name, unit, min)
}

// Dish создаёт активное блюдо с рецептом и возвращает его id.
func (d *DB) Dish(name string, price float64, recipe ...Ing) string {
	d.T.Helper()
	id := d.Str(`INSERT INTO dishes (name, price) VALUES ($1, $2::numeric) RETURNING id::text`, name, price)
	for _, r := range recipe {
		d.Exec(`INSERT INTO dish_ingredients (dish_id, product_id, quantity) VALUES ($1::uuid, $2::uuid, $3::numeric)`,
			id, r.Product, r.Qty)
	}
	return id
}

// Batch создаёт партию (со своей поставкой и записью receipt в журнале).
// hoursLeft — через сколько часов истекает срок; отрицательное — уже просрочена.
func (d *DB) Batch(product string, qty, hoursLeft float64) string {
	d.T.Helper()
	return d.BatchUsed(product, qty, 0, hoursLeft)
}

// BatchUsed — как Batch, но часть партии уже израсходована (used):
// остаток = qty − used, в журнале приход и корректировка.
func (d *DB) BatchUsed(product string, qty, used, hoursLeft float64) string {
	d.T.Helper()
	d.seq++
	deliveryID := d.Str(
		`INSERT INTO deliveries (number, delivery_date) VALUES ($1, now()) RETURNING id::text`,
		fmt.Sprintf("TST-%d", d.seq))
	// received_at всегда на 48 ч раньше expires_at — CHECK (expires_at > received_at) выполняется
	// даже для давно просроченных партий.
	id := d.Str(
		`INSERT INTO batches (delivery_id, product_id, initial_quantity, remaining_quantity,
		                      shelf_life, received_at, expires_at)
		 VALUES ($1::uuid, $2::uuid, $3::numeric, $3::numeric - $4::numeric,
		         interval '48 hours',
		         now() + $5::float8 * interval '1 hour' - interval '48 hours',
		         now() + $5::float8 * interval '1 hour')
		 RETURNING id::text`,
		deliveryID, product, qty, used, hoursLeft)
	d.Exec(`INSERT INTO stock_movements (batch_id, product_id, type, delta)
	        VALUES ($1::uuid, $2::uuid, 'receipt', $3::numeric)`, id, product, qty)
	if used > 0 {
		d.Exec(`INSERT INTO stock_movements (batch_id, product_id, type, delta)
		        VALUES ($1::uuid, $2::uuid, 'adjustment', -$3::numeric)`, id, product, used)
	}
	return id
}

// SetBatchStatus принудительно меняет статус партии (depleted / expired).
func (d *DB) SetBatchStatus(batch, status string) {
	d.T.Helper()
	d.Exec(`UPDATE batches SET status = $2 WHERE id = $1::uuid`, batch, status)
}

// ---------------- Чтение состояния ----------------

// Stock — живой остаток продукта (как его видит product_stock).
func (d *DB) Stock(product string) float64 {
	d.T.Helper()
	return d.Float(`SELECT total_quantity::float8 FROM product_stock WHERE product_id = $1::uuid`, product)
}

// Portions — доступные порции блюда (как их видит dish_availability).
func (d *DB) Portions(dish string) int64 {
	d.T.Helper()
	return d.Int(`SELECT portions FROM dish_availability WHERE dish_id = $1::uuid`, dish)
}

func (d *DB) Remaining(batch string) float64 {
	d.T.Helper()
	return d.Float(`SELECT remaining_quantity::float8 FROM batches WHERE id = $1::uuid`, batch)
}

func (d *DB) BatchStatus(batch string) string {
	d.T.Helper()
	return d.Str(`SELECT status FROM batches WHERE id = $1::uuid`, batch)
}

// MovementSum — сумма движений по журналу для типа (например, "order").
func (d *DB) MovementSum(typ string) float64 {
	d.T.Helper()
	return d.Float(`SELECT COALESCE(sum(delta), 0)::float8 FROM stock_movements WHERE type = $1`, typ)
}

// AssertInvariants проверяет главные инварианты склада:
//  1. остаток каждой партии равен сумме её движений в журнале;
//  2. нет «активных» партий с нулевым остатком (должны быть depleted).
func (d *DB) AssertInvariants() {
	d.T.Helper()
	if n := d.Int(`SELECT count(*) FROM batches b
	                WHERE b.remaining_quantity <>
	                      COALESCE((SELECT sum(delta) FROM stock_movements m WHERE m.batch_id = b.id), 0)`); n != 0 {
		d.T.Errorf("инвариант нарушен: у %d партий остаток не равен сумме движений", n)
	}
	if n := d.Int(`SELECT count(*) FROM batches WHERE status = 'active' AND remaining_quantity = 0`); n != 0 {
		d.T.Errorf("инвариант нарушен: %d активных партий с нулевым остатком", n)
	}
}
