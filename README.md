# Restaurant Inventory — учёт продуктов, партий и стоп-листа

Хакатон-проект: система для ресторана, которая ведёт учёт продуктов по партиям (поставкам) со сроками годности, обрабатывает заказы со списанием ингредиентов по FEFO и автоматически формирует стоп-лист блюд и «горячие предложения».

## Стек

| Слой | Технологии |
|------|------------|
| Backend | Go 1.22+, chi, pgx/v5 |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| БД | PostgreSQL 17 (Supabase, Session Pooler) |
| Миграции | golang-migrate |

## Что уже реализовано

- [x] Схема БД: продукты, поставки, партии, блюда, рецепты, заказы, журнал движений
- [x] Представления `product_stock` и `dish_availability` (стоп-лист)
- [x] Сид-данные: 10 продуктов, 6 блюд, рецепты
- [x] API: `/health`, `/api/products`, `/api/stoplist`
- [x] Фронт: дашборд со статистикой, таблица остатков, стоп-лист
- [ ] POST `/api/deliveries` — приём поставки
- [ ] POST `/api/orders` — заказ с FEFO-списанием
- [ ] Горячие предложения
- [ ] Автосписание просрочки (фоновый воркер)
- [ ] SSE для обновлений в реальном времени

## Структура проекта

```
restaurant/
├── backend/
│   ├── cmd/api/main.go
│   ├── internal/
│   │   ├── db/db.go
│   │   ├── handlers/
│   │   ├── services/
│   │   └── models/
│   ├── migrations/
│   │   ├── 000001_init.up.sql
│   │   ├── 000001_init.down.sql
│   │   ├── 000002_seed.up.sql
│   │   └── 000002_seed.down.sql
│   └── go.mod
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── App.tsx
│   │   ├── types.ts
│   │   ├── utils.ts
│   │   └── index.css
│   ├── vite.config.ts
│   └── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Переменные окружения

Создай `.env` в корне проекта на основе `.env.example` и подставь **свой пароль от Supabase**:

```
DATABASE_URL=postgresql://postgres.ggrgcdtxyjxlvehlrdvb:ТВОЙ_ПАРОЛЬ@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
PORT=8081
```


## Запуск

### 1. Клонировать и настроить

```bash
git clone https://github.com/IIgiyuuII/restaurant.git
cd restaurant
cp .env.example .env
# открой .env и вставь реальный пароль Supabase
```

### 2. Бэкенд

```bash
cd backend

# Установить migrate (один раз)
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Накатить миграции (только один человек в команде!)
migrate -path ./migrations -database "$DATABASE_URL" up

# Запустить
go mod tidy
go run ./cmd/api
```

Сервер на `http://localhost:8081`.

### 3. Фронтенд

```bash
cd frontend
npm install
npm run dev
```

Открой `http://localhost:5173`.

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Проверка соединения с БД |
| GET | `/api/products` | Остатки по всем продуктам |
| GET | `/api/stoplist` | Блюда с `portions = 0` |

Примеры:

```bash
curl.exe http://localhost:8081/health
curl.exe http://localhost:8081/api/products
curl.exe http://localhost:8081/api/stoplist
```

## Модель данных (кратко)

- **products** — справочник продуктов (название, единица, `min_stock` для рекомендаций).
- **deliveries** — поставки (номер, дата).
- **batches** — партии: `product_id` + `initial_quantity` + `remaining_quantity` + `shelf_life` + `expires_at` + `status`.
- **dishes**, **dish_ingredients** — блюда и рецепты.
- **orders**, **order_items** — заказы.
- **stock_movements** — append-only журнал прихода/расхода/просрочки.
- **product_stock** (view) — суммарные остатки только по живым непросроченным партиям.
- **dish_availability** (view) — сколько порций блюда можно приготовить; `0` = стоп-лист.

Ключевые правила:
- Остатки хранятся **по партиям**, а не одним числом — иначе теряются сроки.
- FEFO: списание с `ORDER BY expires_at` среди `status='active' AND expires_at > now() AND remaining_quantity > 0`.
- Стоп-лист — **не таблица**, а представление: нечему рассинхронизироваться.
- `stock_movements` — журнал для аналитики и аудита.

## Правила работы в команде

1. **Пароль Supabase** и `project-ref` — в личке, не в Git.
2. **Миграции накатывает только один человек** (владелец проекта Supabase), чтобы не было гонок. Остальные пуллят код.
3. **Порт 8081** для бэкенда — одинаковый у всех, чтобы фронт работал без правок.
4. **Ветки**:
   - `main` — стабильная, сюда мержим только рабочее.
   - `feature/<название>` — под каждую задачу.
5. **Перед push**: `git pull --rebase origin main`, чтобы избежать лишних merge-коммитов.

## Горячие предложения (план)

Скор блюда по его ингредиентам:

```
score(dish) = Σ по ингредиентам  w_urgency(часы до expires_at) × доля партии, которую блюдо съедает
```

- Чем меньше часов до истечения — тем выше вес.
- Учитываем, сколько блюд использует ингредиент (чем больше — тем ниже приоритет отдать его именно этому блюду).
- Отбрасываем блюда из стоп-листа.
- Причина формируется автоматически: «Молоко: партия истекает через 5 ч, осталось 3 л».

## Полезные ссылки

- Supabase Dashboard: https://supabase.com/dashboard
- Репозиторий: https://github.com/IIgiyuuII/restaurant