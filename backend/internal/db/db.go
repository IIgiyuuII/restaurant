package db

import (
    "context"
    "time"

    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
    cfg, err := pgxpool.ParseConfig(url)
    if err != nil {
        return nil, err
    }

    // Supabase Session Pooler на Free пускает только 15 сессий.
    // Держим маленький пул + короткое время жизни соединения.
    cfg.MaxConns = 4
    cfg.MinConns = 0
    cfg.MaxConnLifetime = 5 * time.Minute
    cfg.MaxConnIdleTime = 30 * time.Second
    cfg.HealthCheckPeriod = 30 * time.Second

    // Supabase pooler не любит prepared statements.
    cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

    return pgxpool.NewWithConfig(ctx, cfg)
}