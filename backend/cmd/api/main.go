package main

import (
    "context"
    "encoding/json"
    "log"
    "net/http"
    "os"
    "strings"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
    "github.com/go-chi/cors"
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

    r := chi.NewRouter()
    r.Use(middleware.Logger)
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins: []string{"*"},
        AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowedHeaders: []string{"*"},
    }))

    r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
        if err := pool.Ping(r.Context()); err != nil {
            http.Error(w, "db down", 500)
            return
        }
        w.Write([]byte("ok"))
    })

    r.Get("/api/products", func(w http.ResponseWriter, r *http.Request) {
        rows, err := pool.Query(r.Context(),
            "SELECT product_id, name, unit, total_quantity, nearest_expiry FROM product_stock ORDER BY name")
        if err != nil {
            http.Error(w, err.Error(), 500)
            return
        }
        defer rows.Close()

        out := []map[string]any{}
        for rows.Next() {
            var id, name, unit string
            var qty float64
            var nearest *string
            _ = rows.Scan(&id, &name, &unit, &qty, &nearest)
            out = append(out, map[string]any{
                "id": id, "name": name, "unit": unit,
                "quantity": qty, "nearest_expiry": nearest,
            })
        }
        writeJSON(w, out)
    })

    r.Get("/api/stoplist", func(w http.ResponseWriter, r *http.Request) {
        rows, err := pool.Query(r.Context(),
            "SELECT dish_id, name, portions FROM dish_availability WHERE portions = 0 ORDER BY name")
        if err != nil {
            http.Error(w, err.Error(), 500)
            return
        }
        defer rows.Close()

        out := []map[string]any{}
        for rows.Next() {
            var id, name string
            var portions int
            _ = rows.Scan(&id, &name, &portions)
            out = append(out, map[string]any{"id": id, "name": name, "portions": portions})
        }
        writeJSON(w, out)
    })

    // Списание просрочки: фоновая проверка + ручное списание через API.
    expiry := services.NewExpiryService(pool, autoWriteOffInterval())
    go expiry.RunAutoWriteOff(ctx)

    // Поставки, заказы (FEFO), меню, горячие предложения, пополнение, списания
    handlers.New(pool, expiry).Mount(r)

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

func writeJSON(w http.ResponseWriter, v any) {
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(v)
}