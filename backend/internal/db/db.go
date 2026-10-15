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

    cfg.MaxConns = 4
    cfg.MinConns = 0
    cfg.MaxConnLifetime = 5 * time.Minute
    cfg.MaxConnIdleTime = 30 * time.Second
    cfg.HealthCheckPeriod = 30 * time.Second

    
    cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

    return pgxpool.NewWithConfig(ctx, cfg)
}