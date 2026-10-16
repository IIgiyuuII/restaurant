# Restaurant Inventory — учёт продуктов, партий и стоп-листа

Хакатон-проект: система для ресторана, которая ведёт учёт продуктов по партиям (поставкам) со сроками годности, обрабатывает заказы со списанием ингредиентов по FEFO, автоматически формирует стоп-лист блюд, горячие предложения и рекомендации по пополнению запасов.

> **Демо:**
> - Web: https://magnificent-trust-production-062b.up.railway.app/
> - API: https://restaurant-production-2e70.up.railway.app/health
> - Репозиторий: https://github.com/IIgiyuuII/restaurant

## Стек

| Слой | Технологии |
|------|------------|
| Backend | Go (см. `backend/go.mod`), chi/v5, pgx/v5, golang-migrate |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 + axios |
| БД | PostgreSQL 17 (Supabase, Session Pooler) |
| Тесты | Go `testing`, PostgreSQL в Docker, изолированные схемы |
| CI | GitHub Actions (`.github/workflows/backend-tests.yml`) |
| CD | Railway (backend + frontend), Supabase как основная БД |

## Что реализовано

### Backend

- [x] Слоистая архитектура: `handlers` → `services` → `models`
- [x] Схема БД: продукты, поставки, партии, блюда, рецепты, заказы, журнал движений
- [x] Представления `product_stock` и `dish_availability` (стоп-лист)
- [x] Миграции `golang-migrate` (init + seed справочников + seed поставок)
- [x] Типизированные ошибки: `ValidationError → 400`, `ConflictError → 409`
- [x] **POST `/api/deliveries`** — приём поставки: партии + запись `receipt` в журнал
- [x] **POST `/api/orders`** — заказ с FEFO-списанием: блокировка партий, проверка наличия, отказ при нехватке, запись `order` в журнал
- [x] **POST `/api/writeoffs`** — ручное списание просрочки
- [x] **GET `/api/products`** — остатки по продуктам
- [x] **GET `/api/dishes`** — меню с доступными порциями и ценами
- [x] **GET `/api/stoplist`** — блюда с `portions = 0`
- [x] **GET `/api/batches`** — живые партии со сроками, истекающие и просроченные
- [x] **GET `/api/orders`** — история заказов (created / rejected с причиной)
- [x] **GET `/api/hot-offers`** — горячие предложения со скорингом и объяснением
- [x] **GET `/api/restock`** — что закупить, с `blocked_dishes` и рекомендуемым количеством
- [x] **GET `/api/writeoffs?days=N`** — аналитика списаний
- [x] **GET `/health`** — проверка соединения с БД
- [x] Фоновый воркер автосписания просрочки (`AUTO_WRITEOFF_INTERVAL`)
- [x] Unit- и integration-тесты с изолированными схемами в тестовой БД
- [x] CI на GitHub Actions: `go vet`, `go test -race`, покрытие

### Frontend (web)

- [x] Дашборд с аналитикой: карточки, графики заказов, диаграммы сроков и запасов
- [x] Таблица остатков с раскрывающимися партиями и цветовой индикацией сроков
- [x] Стоп-лист
- [x] Форма поставки с рекомендациями из `/api/restock`
- [x] Форма заказа с корзиной, страница заказов, результат с `write_offs` / `shortages`
- [x] Горячие предложения с объяснением причин
- [x] Раздел списаний: ручное списание и аналитика
- [x] Тёмная тема, сайдбар, hash-based навигация, адаптивная вёрстка


## Структура проекта

```
restaurant/
├── .github/workflows/backend-tests.yml   # CI: go vet + go test -race + coverage
├── backend/
│   ├── cmd/api/main.go                   # точка входа, роутер, CORS, автосписание
│   ├── internal/
│   │   ├── db/                           # pgxpool + simple protocol для Supabase pooler
│   │   ├── handlers/                     # HTTP-слой
│   │   ├── services/                     # бизнес-логика
│   │   │   ├── delivery.go               # приём поставок
│   │   │   ├── orders.go                 # FEFO-заказы
│   │   │   ├── hot_offers.go             # горячие предложения (скоринг)
│   │   │   ├── restock.go                # рекомендации по пополнению
│   │   │   ├── expiry.go                 # списание просрочки + аналитика
│   │   │   └── errors.go                 # ValidationError, ConflictError
│   │   ├── models/                       # DTO
│   │   └── testutil/                     # изолированные схемы для интеграционных тестов
│   ├── migrations/
│   │   ├── 000001_init.{up,down}.sql
│   │   ├── 000002_seed.{up,down}.sql
│   │   └── 000003_seed_deliveries.{up,down}.sql
│   ├── Dockerfile                        #
│   ├── .dockerignore
│   ├── docker-compose.test.yml           # одноразовая БД для тестов
│   └── go.mod
├── frontend/
│   ├── src/
│   │   ├── components/                   # дашборд, таблицы, формы, графики
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── Dockerfile                        # Vite build + Caddy
│   ├── Caddyfile                         # раздача статики с gzip и SPA-fallback
│   ├── .dockerignore
│   └── package.json
├── DEPLOY.md                             # инструкция деплоя на Railway
├── .env.example
├── .gitignore
└── README.md
```

## Переменные окружения

Создай `.env` в корне проекта на основе `.env.example` и подставь **свой пароль от Supabase**:

```
DATABASE_URL=postgresql://postgres.ggrgcdtxyjxlvehlrdvb:ТВОЙ_ПАРОЛЬ@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
PORT=8081
AUTO_WRITEOFF_INTERVAL=15m
```
> `AUTO_WRITEOFF_INTERVAL=0` или `off` выключает фоновое списание просрочки.

## Локальный запуск

### 1. Подготовить конфигурацию

```powershell
Copy-Item .env.example .env
# открой .env и вставь реальный пароль Supabase
```

### 2. Backend

```powershell
cd backend
go mod download
go run ./cmd/api
```

API слушает `http://localhost:8081`. Проверка:

```powershell
Invoke-RestMethod http://localhost:8081/health
```

### 3. Web frontend

```powershell
cd frontend
npm ci
npm run dev
```

Vite поднимет `http://localhost:5173`.


## API

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/health` | Проверка соединения с БД |
| GET | `/api/products` | Остатки продуктов |
| GET | `/api/dishes` | Меню и доступное число порций |
| GET | `/api/stoplist` | Блюда, недоступные к заказу |
| GET | `/api/batches` | Партии и сроки годности |
| GET | `/api/orders` | История заказов |
| POST | `/api/orders` | Создание заказа со списанием по FEFO |
| POST | `/api/deliveries` | Приём поставки и создание партий |
| GET | `/api/hot-offers` | Горячие предложения с объяснением скоринга |
| GET | `/api/restock` | Продукты, которые нужно пополнить |
| GET | `/api/writeoffs?days=30` | Аналитика списаний за период |
| POST | `/api/writeoffs` | Ручное списание просроченных партий |

Примеры:

```powershell
Invoke-RestMethod https://restaurant-api-production.up.railway.app/health
Invoke-RestMethod https://restaurant-api-production.up.railway.app/api/products
Invoke-RestMethod https://restaurant-api-production.up.railway.app/api/dishes
```

### Создание поставки

```json
{
  "number": "D-20261015-0001",
  "delivery_date": "2026-10-15T10:00:00Z",
  "items": [
    { "product_id": "UUID-молока", "quantity": 5000, "shelf_life_hours": 48 },
    { "product_id": "UUID-муки",   "quantity": 8000, "shelf_life_hours": 4320 }
  ]
}
```

### Создание заказа

```json
{
  "items": [
    { "dish_id": "UUID-супа", "quantity": 2 },
    { "dish_id": "UUID-омлета", "quantity": 1 }
  ]
}
```

Ответ при успехе: `201 Created`, статус `created`, список `write_offs` — из каких партий списано.
Ответ при нехватке: `409 Conflict`, статус `rejected`, `reason` и список `shortages`.

### Списание просрочки

Пустое тело — все просроченные партии. Или конкретные:

```json
{ "batch_ids": ["UUID-1", "UUID-2"] }
```

## Модель данных

### Таблицы

- **products** — справочник продуктов: `id`, `name`, `unit` (`g`/`ml`/`pcs`), `min_stock`.
- **deliveries** — поставки: `id`, `number` (UNIQUE), `delivery_date`, `created_at`.
- **batches** — партии: `delivery_id`, `product_id`, `initial_quantity`, `remaining_quantity`, `shelf_life`, `received_at`, `expires_at`, `status` (`active`/`depleted`/`expired`), `updated_at`.
- **dishes**, **dish_ingredients** — блюда и рецепты.
- **orders**, **order_items** — заказы: `status` (`created`/`rejected`), `reason`.
- **stock_movements** — append-only журнал: `receipt`/`order`/`expired_writeoff`/`adjustment`.

### Представления

- **product_stock** — суммарные остатки по продуктам, только живые непросроченные партии. Считает `total_quantity` и `nearest_expiry`.
- **dish_availability** — сколько порций блюда можно приготовить. `portions = 0` = стоп-лист.

### Ключевые правила

- **Остатки хранятся по партиям**, а не одним числом — иначе теряются сроки годности.
- **FEFO** (First Expired, First Out): списание с `ORDER BY expires_at` среди `status='active' AND expires_at > now() AND remaining_quantity > 0`.
- **Стоп-лист** — не таблица, а представление: нечему рассинхронизироваться.
- **`stock_movements`** — журнал для аналитики и аудита; изменение остатка партии и запись в журнал — в одной транзакции.
- **`numeric(12,3)`** вместо `float` — точная арифметика граммов/миллилитров.
- **`uuid`** как внешние идентификаторы.

## Горячие предложения

Скор блюда по ингредиентам:

```
score(dish) = Σ по ингредиентам  срочность(партии) × покрытие(блюдо, партия) × доля(блюдо, продукт)
```

- **Срочность** = `0.5^(часов_до_конца / 24)` — вдвое падает за сутки.
- **Покрытие** — какую часть партии блюдо реально способно израсходовать с учётом FEFO (более ранние партии «занимают» часть продукта).
- **Доля** — расход продукта в этом блюде / суммарный расход среди всех доступных блюд с этим продуктом. Баллы делятся между блюдами.
- Отбрасываются блюда из стоп-листа.
- Причина формируется автоматически: «Молоко: партия 6000 г истекает через 17 ч — блюдо может израсходовать всю партию».

Алгоритм — чистая функция `scoreHotOffers`, покрыт unit-тестами (`hot_offers_test.go`).

## Тесты backend

- **Unit-тесты** — бизнес-логика без БД: `normalizeOrder`, `scoreHotOffers`, `suggestQuantity`, типы ошибок, парсинг env.
- **Integration-тесты** — SQL, транзакции, FEFO, конкурентность, схема БД. Требуют **отдельной** тестовой БД.
- **Тесты миграций** — `up`/`down`/`up`, seed-данные, ограничения схемы.

**Покрытие (последний прогон CI):**

| Пакет | Покрытие |
|-------|----------|
| `internal/db` | 100.0% |
| `internal/services` | 91.4% |
| `internal/handlers` | 78.8% |
| `cmd/api` | 43.8% |
| `internal/models` | — (только DTO) |
| `internal/testutil` | — (тестовые хелперы) |

> **Не используй production `DATABASE_URL` как `TEST_DATABASE_URL`.** Тестовая утилита создаёт и удаляет отдельные схемы, но безопаснее держать тестовую БД полностью отдельно.

### Запуск на Windows (PowerShell)

```powershell
cd backend

# 1. Поднять временную PostgreSQL 17 в Docker
docker compose -f docker-compose.test.yml up -d

# 2. Указать адрес и обязательный режим интеграционных тестов
$env:TEST_DATABASE_URL = "postgresql://test:test@127.0.0.1:5433/restaurant_test?sslmode=disable"
$env:TEST_REQUIRE_DB = "1"

# 3. Прогнать проверки
go vet ./...
go test ./... -count=1 -v

# С детектором гонок, как в CI:
go test ./... -race -count=1 -coverprofile=coverage.out
go tool cover -func=coverage.out | Select-Object -Last 1

# 4. Остановить контейнер
docker compose -f docker-compose.test.yml down
Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:TEST_REQUIRE_DB -ErrorAction SilentlyContinue
```

Тестовая БД использует `tmpfs` — данные не сохраняются между запусками.

## CI в GitHub Actions

Workflow: `.github/workflows/backend-tests.yml`. На `push` и `pull_request` (при изменениях в `backend/**` или в самом workflow):

1. Поднимает временный PostgreSQL 17 service container.
2. Выставляет `TEST_DATABASE_URL` и `TEST_REQUIRE_DB=1` — интеграционные тесты не могут молча пропуститься.
3. Устанавливает Go из `backend/go.mod`.
4. Запускает `go vet ./...`.
5. Запускает `go test ./... -race -count=1 -coverprofile=coverage.out`.
6. Выводит итоговое покрытие.

Проверить: GitHub → вкладка **Actions** → workflow `backend-tests` → job `test`.

CI не требует Supabase secrets — использует свою временную БД.

## Деплой

Backend и frontend живут на **Railway** (два сервиса из одного репозитория), БД — на **Supabase**.

- Backend: `backend/Dockerfile` (multi-stage, ~20 МБ).
- Frontend: `frontend/Dockerfile` + `frontend/Caddyfile` (сборка Vite + раздача статики Caddy).
- Railway следит за веткой **`dev`** и деплоит при push.
- `VITE_API_URL` для фронта вшивается на этапе сборки — адрес бэкенда + `/api`.



## Правила работы в команде

### Ветки

| Ветка | Назначение |
|-------|------------|
| `main` | Стабильная. Только через Pull Request. |
| `dev` | Основная для разработки и деплоя на Railway. |


### Workflow

```bash
git checkout dev
git pull origin dev
git checkout -b feature/my-task
# ... работаешь ...
git add .
git commit -m "feat: my task"
git push -u origin feature/my-task
# На GitHub: PR feature/my-task → dev
```


## Текущее состояние

- [x] Backend API и бизнес-логика склада
- [x] SQL-миграции и seed-данные
- [x] Unit- и PostgreSQL integration-тесты backend
- [x] Локальный запуск тестовой БД через Docker Compose
- [x] GitHub Actions workflow: `go vet`, `go test -race`, покрытие
- [x] Web frontend с дашбордом, формами и аналитикой
- [x] Деплой backend и frontend на Railway
- [x] Supabase как production БД


## Полезные ссылки

- Репозиторий: https://github.com/IIgiyuuII/restaurant
- Supabase Dashboard: https://supabase.com/dashboard
- Railway: https://railway.com
- golang-migrate: https://github.com/golang-migrate/migrate