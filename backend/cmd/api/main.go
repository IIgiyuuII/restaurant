package main

import (
    "context"
    "encoding/json"
    "log"
    "net/http"
    "os"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
    "github.com/go-chi/cors"
    "github.com/joho/godotenv"

    "github.com/IIgiyuuII/restaurant/backend/internal/db"
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

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    log.Println("listening on :" + port)
    log.Fatal(http.ListenAndServe(":"+port, r))
}

func writeJSON(w http.ResponseWriter, v any) {
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(v)
}