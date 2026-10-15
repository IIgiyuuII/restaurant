package services

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/IIgiyuuII/restaurant/backend/internal/models"
)

const (
	maxWriteOffIDs      = 200
	reportRecentLimit   = 50
	DefaultReportDays   = 30
	maxReportDays       = 365
	DefaultAutoWriteOff = 15 * time.Minute
)

// ExpiryService — списание просроченных партий и аналитика списаний.
//
// Просроченная партия и так не попадает в остатки и не используется в заказах
// (product_stock и FEFO отфильтровывают expires_at <= now()). Списание — это учёт:
// партия получает статус expired, остаток обнуляется, а в журнал пишется expired_writeoff.
type ExpiryService struct {
	pool      *pgxpool.Pool
	autoEvery time.Duration
}

// NewExpiryService: autoEvery <= 0 выключает фоновое автосписание.
func NewExpiryService(pool *pgxpool.Pool, autoEvery time.Duration) *ExpiryService {
	return &ExpiryService{pool: pool, autoEvery: autoEvery}
}

// AutoCheckMinutes — период фоновой проверки в минутах (0 — выключена).
func (s *ExpiryService) AutoCheckMinutes() int {
	if s.autoEvery <= 0 {
		return 0
	}
	return max(1, int(s.autoEvery/time.Minute))
}

type expiredBatch struct {
	id        string
	productID string
	name      string
	unit      string
	milli     int64
}

// WriteOffExpired списывает просроченные партии. ids пуст — списываются все.
// Непросроченные и уже списанные партии из ids молча пропускаются, поэтому
// двойной клик или одновременный запуск фонового воркера безопасны.
func (s *ExpiryService) WriteOffExpired(ctx context.Context, ids []string) (*models.ExpiryWriteOffResult, error) {
	if len(ids) > maxWriteOffIDs {
		return nil, validation("слишком много партий (максимум %d)", maxWriteOffIDs)
	}

	filter := ""
	args := make([]any, 0, len(ids))
	if len(ids) > 0 {
		ph := make([]string, 0, len(ids))
		for _, id := range ids {
			id = strings.TrimSpace(id)
			if id == "" {
				return nil, validation("пустой batch_id")
			}
			args = append(args, id)
			ph = append(ph, fmt.Sprintf("$%d::uuid", len(args)))
		}
		filter = " AND b.id IN (" + strings.Join(ph, ", ") + ")"
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	list, err := lockExpired(ctx, tx, filter, args)
	if err != nil {
		return nil, err
	}

	res := &models.ExpiryWriteOffResult{Items: []models.ExpiredItem{}}
	for _, e := range list {
		_, err := tx.Exec(ctx,
			`UPDATE batches
			    SET remaining_quantity = 0, status = 'expired', updated_at = now()
			  WHERE id = $1::uuid`, e.id)
		if err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO stock_movements (batch_id, product_id, type, delta)
			 VALUES ($1::uuid, $2::uuid, 'expired_writeoff', -($3::bigint::numeric / 1000))`,
			e.id, e.productID, e.milli)
		if err != nil {
			return nil, err
		}
		res.Items = append(res.Items, models.ExpiredItem{
			BatchID: e.id, ProductID: e.productID, Product: e.name, Unit: e.unit,
			Quantity: float64(e.milli) / 1000,
		})
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	res.WrittenOff = len(res.Items)
	return res, nil
}

// lockExpired блокирует и возвращает просроченные партии с ненулевым остатком.
func lockExpired(ctx context.Context, tx pgx.Tx, filter string, args []any) ([]expiredBatch, error) {
	rows, err := tx.Query(ctx,
		`SELECT b.id, b.product_id, p.name, p.unit, (b.remaining_quantity * 1000)::bigint
		   FROM batches b
		   JOIN products p ON p.id = b.product_id
		  WHERE b.status = 'active'
		    AND b.remaining_quantity > 0
		    AND b.expires_at <= now()`+filter+`
		  ORDER BY b.expires_at, b.id
		    FOR UPDATE OF b`, args...)
	if err != nil {
		return nil, badBatchID(err)
	}
	defer rows.Close()

	var out []expiredBatch
	for rows.Next() {
		var e expiredBatch
		if err := rows.Scan(&e.id, &e.productID, &e.name, &e.unit, &e.milli); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, badBatchID(err)
	}
	return out, nil
}

// badBatchID превращает ошибку «невалидный uuid» в ошибку валидации (HTTP 400).
func badBatchID(err error) error {
	if pgCode(err) == pgInvalidText {
		return validation("некорректный batch_id")
	}
	return err
}

// Report — аналитика списаний за последние days дней: по продуктам и последние записи.
// Оба запроса идут в одном снимке данных.
func (s *ExpiryService) Report(ctx context.Context, days int) (*models.ExpiryReport, error) {
	if days <= 0 {
		days = DefaultReportDays
	}
	if days > maxReportDays {
		days = maxReportDays
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	rep := &models.ExpiryReport{
		Days:             days,
		ByProduct:        []models.ExpiryStat{},
		Recent:           []models.ExpiryRecord{},
		AutoCheckMinutes: s.AutoCheckMinutes(),
	}

	statRows, err := tx.Query(ctx,
		`SELECT p.id, p.name, p.unit, count(*)::int, (-sum(m.delta))::float8
		   FROM stock_movements m
		   JOIN products p ON p.id = m.product_id
		  WHERE m.type = 'expired_writeoff'
		    AND m.created_at >= now() - $1::int * interval '1 day'
		  GROUP BY p.id, p.name, p.unit
		  ORDER BY count(*) DESC, sum(m.delta), p.name`, days)
	if err != nil {
		return nil, err
	}
	defer statRows.Close()
	for statRows.Next() {
		var st models.ExpiryStat
		if err := statRows.Scan(&st.ProductID, &st.Name, &st.Unit, &st.Batches, &st.Quantity); err != nil {
			return nil, err
		}
		rep.TotalBatches += st.Batches
		rep.ByProduct = append(rep.ByProduct, st)
	}
	if err := statRows.Err(); err != nil {
		return nil, err
	}
	statRows.Close() // освобождаем соединение транзакции перед следующим запросом

	recRows, err := tx.Query(ctx,
		`SELECT m.id, m.created_at, p.id, p.name, p.unit, (-m.delta)::float8, d.number, b.expires_at
		   FROM stock_movements m
		   JOIN products   p ON p.id = m.product_id
		   JOIN batches    b ON b.id = m.batch_id
		   JOIN deliveries d ON d.id = b.delivery_id
		  WHERE m.type = 'expired_writeoff'
		    AND m.created_at >= now() - $1::int * interval '1 day'
		  ORDER BY m.created_at DESC, m.id DESC
		  LIMIT $2`, days, reportRecentLimit)
	if err != nil {
		return nil, err
	}
	defer recRows.Close()
	for recRows.Next() {
		var r models.ExpiryRecord
		if err := recRows.Scan(&r.ID, &r.CreatedAt, &r.ProductID, &r.Product, &r.Unit,
			&r.Quantity, &r.DeliveryNumber, &r.ExpiresAt); err != nil {
			return nil, err
		}
		r.CreatedAt = r.CreatedAt.UTC()
		r.ExpiresAt = r.ExpiresAt.UTC()
		rep.Recent = append(rep.Recent, r)
	}
	return rep, recRows.Err()
}

// RunAutoWriteOff — фоновый воркер: раз в autoEvery списывает просроченные партии.
// Блокируется до отмены ctx, запускать в отдельной горутине.
// Срок годности считается в часах и днях, поэтому проверять каждую минуту незачем.
func (s *ExpiryService) RunAutoWriteOff(ctx context.Context) {
	if s.autoEvery <= 0 {
		log.Println("auto write-off: выключено (AUTO_WRITEOFF_INTERVAL=0)")
		return
	}
	log.Printf("auto write-off: проверка просрочки каждые %s", s.autoEvery)

	s.autoOnce(ctx)
	t := time.NewTicker(s.autoEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.autoOnce(ctx)
		}
	}
}

func (s *ExpiryService) autoOnce(ctx context.Context) {
	res, err := s.WriteOffExpired(ctx, nil)
	if err != nil {
		log.Printf("auto write-off: ошибка: %v", err)
		return
	}
	if res.WrittenOff > 0 {
		log.Printf("auto write-off: списано просроченных партий: %d", res.WrittenOff)
	}
}
