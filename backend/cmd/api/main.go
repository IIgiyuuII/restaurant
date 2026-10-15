package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "strings"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
    "github.com/go-chi/cors"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/joho/godotenv"

    "github.com/IIgiyuuII/restaurant/backend/internal/db"
    "github.com/IIgiyuuII/restaurant/backend/internal/handlers"
    "github.com/IIgiyuuII/restaurant/backend/internal/services"
)

func main() {
    // .env ищем в корне проекта (на уровень выше backend/)
    _ = godotenv.Load("../.env")
    _ = godotenv.Load(".env")

    ctx := context.Background()

    pool, err := db.Connect(ctx, os.Getenv("DATABASE_URL"))
    if err != nil {
        log.Fatal("db connect: ", err)
    }
    defer pool.Close()

    if err := pool.Ping(ctx); err != nil {
        log.Fatal("db ping: ", err)
    }
    log.Println("connected to Supabase")

    // Списание просрочки: фоновая проверка + ручное списание через API.
    expiry := services.NewExpiryService(pool, autoWriteOffInterval())
    go expiry.RunAutoWriteOff(ctx)

    // Все маршруты API (и CORS) собираются в newRouter — так их можно тестировать.
    r := newRouter(pool, expiry)

    port := os.Getenv("PORT")
    if port == "" {
        port = "8081"
    }
    log.Println("listening on :" + port)
    log.Fatal(http.ListenAndServe(":"+port, r))
}

// autoWriteOffInterval читает AUTO_WRITEOFF_INTERVAL (например "15m", "1h").
// Пусто — по умолчанию 15 минут; "0" или "off" — автосписание выключено.
// Меньше минуты не принимаем: сроки годности считаются в часах, проверять чаще незачем.
func autoWriteOffInterval() time.Duration {
    v := strings.ToLower(strings.TrimSpace(os.Getenv("AUTO_WRITEOFF_INTERVAL")))
    switch v {
    case "":
        return services.DefaultAutoWriteOff
    case "0", "off", "false", "no":
        return 0
    }
    d, err := time.ParseDuration(v)
    if err != nil || d < time.Minute {
        log.Printf("AUTO_WRITEOFF_INTERVAL=%q некорректен (нужно, например, 15m или 1h), беру %s", v, services.DefaultAutoWriteOff)
        return services.DefaultAutoWriteOff
    }
    return d
}

// newRouter собирает HTTP-роутер: логирование, CORS и все маршруты API.
func newRouter(pool *pgxpool.Pool, expiry *services.ExpiryService) http.Handler {
    r := chi.NewRouter()
    r.Use(middleware.Logger)
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins: []string{"*"},
        AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowedHeaders: []string{"*"},
    }))

    // Здоровье, остатки, стоп-лист, поставки, заказы (FEFO), меню,
    // горячие предложения, пополнение, списания.
    handlers.New(pool, expiry).Mount(r)
    return r
}