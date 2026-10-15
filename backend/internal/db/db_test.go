package db_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/IIgiyuuII/restaurant/backend/internal/db"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

// ---------- Connect: проверки без обращения к серверу ----------

// Пустой URL ошибкой Connect не считается: pgx берёт параметры из окружения (PGHOST…),
// а недоступную БД main() ловит следующим вызовом pool.Ping.
func TestConnect_InvalidURL(t *testing.T) {
	for _, url := range []string{"://bad", "postgres://user:pass@host:notaport/db"} {
		if _, err := db.Connect(context.Background(), url); err == nil {
			t.Errorf("Connect(%q): ожидали ошибку разбора", url)
		}
	}
}

func TestConnect_PoolConfig(t *testing.T) {
	pool, err := db.Connect(context.Background(), "postgres://u:p@127.0.0.1:1/db")
	if err != nil {
		t.Fatalf("Connect не должен подключаться сразу: %v", err)
	}
	defer pool.Close()
	cfg := pool.Config()

	// Supabase pooler не любит prepared statements — без simple protocol всё ломается.
	if cfg.ConnConfig.DefaultQueryExecMode != pgx.QueryExecModeSimpleProtocol {
		t.Errorf("нужен QueryExecModeSimpleProtocol, получили %v", cfg.ConnConfig.DefaultQueryExecMode)
	}
	// Session pooler Supabase пускает ~15 клиентов на весь проект (делит вся команда).
	if cfg.MaxConns < 1 || cfg.MaxConns > 4 {
		t.Errorf("MaxConns = %d, ожидали 1..4 (лимит пулера на всю команду)", cfg.MaxConns)
	}
	if cfg.MinConns != 0 {
		t.Errorf("MinConns = %d, ожидали 0: простаивающие подключения не держим", cfg.MinConns)
	}
}

func TestConnect_UnreachableServerFailsOnPing(t *testing.T) {
	pool, err := db.Connect(context.Background(), "postgres://u:p@127.0.0.1:1/db")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := pool.Ping(ctx); err == nil {
		t.Fatal("Ping к недоступному серверу должен вернуть ошибку")
	}
}

func TestConnect_RealDatabase(t *testing.T) {
	url := testutil.URL(t)
	pool, err := db.Connect(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(context.Background()); err != nil {
		t.Fatalf("Ping: %v", err)
	}
	var one int
	if err := pool.QueryRow(context.Background(), "SELECT 1").Scan(&one); err != nil || one != 1 {
		t.Fatalf("SELECT 1: %v, %d", err, one)
	}
}
