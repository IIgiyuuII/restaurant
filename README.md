# Restaurant Inventory — учёт продуктов, партий и стоп-листа

Хакатон-проект: система для ресторана, которая ведёт учёт продуктов по партиям (поставкам) со сроками годности, обрабатывает заказы со списанием ингредиентов по FEFO, автоматически формирует стоп-лист блюд, горячие предложения и рекомендации по пополнению.

## Стек

| Слой | Технологии |
|------|------------|
| Backend | Go (см. `backend/go.mod`), chi/v5, pgx/v5, golang-migrate |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 + axios |
| Mobile | Expo / React Native + TypeScript + axios |
| БД | PostgreSQL 17 (Supabase, Session Pooler) |
| Тесты | Go `testing`, PostgreSQL в Docker, изолированные схемы |
| CI | GitHub Actions (`.github/workflows/backend-tests.yml`) |
| Деплой | Railway (в планах) + существующая Supabase как основная БД |

## Что уже реализовано

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

### Frontend

- [x] Дашборд: карточки статистики (продукты, нет в наличии, истекают <24ч, в стоп-листе)
- [x] Таблица остатков с раскрывающимися партиями и цветовой индикацией сроков
- [x] Стоп-лист
- [x] Форма поставки
- [x] Форма заказа с корзиной, страница заказов и результат с `write_offs` / `shortages`
- [x] Горячие предложения с объяснением причин
- [x] Раздел списаний
- [x] Тёмная тема, сайдбар, адаптивная вёрстка

### Mobile

- [x] Expo / React Native: дашборд, остатки, стоп-лист, горячие предложения, заказы
- [ ] Настроить адрес API под физическое устройство (`localhost` на телефоне — это сам телефон)

## Структура проекта

```
restaurant/
├── backend/
│   ├── cmd/api/main.go                  # точка входа, роутер, CORS
│   ├── internal/
│   │   ├── db/                          # pgxpool + simple protocol для pooler
│   │   ├── handlers/                    # HTTP-слой
│   │   ├── services/                    # бизнес-логика
│   │   │   ├── delivery.go
│   │   │   ├── orders.go
│   │   │   ├── hot_offers.go
│   │   │   ├── restock.go
│   │   │   ├── expiry.go
│   │   │   └── errors.go
│   │   ├── models/                      # DTO
│   │   └── testutil/                    # изолированные схемы для тестов
│   ├── migrations/
│   │   ├── 000001_init.{up,down}.sql
│   │   ├── 000002_seed.{up,down}.sql
│   │   └── 000003_seed_deliveries.{up,down}.sql
│   ├── docker-compose.test.yml          # одноразовая БД для тестов
│   └── go.mod
├── frontend/                            # React + Vite
├── mobile/                              # Expo + React Native
├── .github/workflows/backend-tests.yml  # CI
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
go mod download
go run ./cmd/api
```

Сервер на `http://localhost:8081`. Проверка:

```powershell
Invoke-RestMethod http://localhost:8081/health
```

### 3. Frontend

```bash
cd frontend
npm ci
npm run dev
```

Открой `http://localhost:5173`.

### 4. Mobile

```bash
cd mobile
npm ci
npm start
```

Дальше — инструкции Expo в терминале. Для теста на телефоне укажи в `mobile/src/api.ts` IP компьютера в локальной сети, а не `localhost`.

## Тесты backend

- **Unit-тесты** — бизнес-логика без БД: `normalizeOrder`, `scoreHotOffers`, `suggestQuantity`, типы ошибок, парсинг env.
- **Integration-тесты** — SQL, транзакции, FEFO, конкурентность, схема БД. Требуют отдельной тестовой БД.
- **Тесты миграций** — `up`/`down`/`up`, seed-данные, ограничения схемы.

**Тестовая БД — отдельная от production. Не используй `DATABASE_URL` от Supabase как `TEST_DATABASE_URL`.**

### Запуск на Windows (PowerShell)

```powershell
cd backend

# 1. Поднять временную PostgreSQL 16 в Docker
docker compose -f docker-compose.test.yml up -d

# 2. Указать адрес и обязательный режим интеграционных тестов
$env:TEST_DATABASE_URL = "postgresql://test:test@127.0.0.1:5433/restaurant_test?sslmode=disable"
$env:TEST_REQUIRE_DB = "1"

# 3. Прогнать проверки
go vet ./...
go test ./... -count=1 -v

# 4. Остановить контейнер
docker compose -f docker-compose.test.yml down
Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:TEST_REQUIRE_DB -ErrorAction SilentlyContinue
```

Тестовая БД использует `tmpfs` — данные не сохраняются между запусками. Если порт `5433` занят — поменяй проброс порта в `docker-compose.test.yml` и `TEST_DATABASE_URL` на одно значение.

**С детектором гонок, как в CI:**

```powershell
go test ./... -race -count=1 -coverprofile=coverage.out
go tool cover -func=coverage.out | Select-Object -Last 1
```

**Без Docker** — unit-тесты пройдут, интеграционные будут пропущены. Чтобы случайно не принять пропуск за полный прогон, локально используй `TEST_REQUIRE_DB=1` с Docker.

## CI в GitHub Actions

Workflow: `.github/workflows/backend-tests.yml`. На `push` и `pull_request` (при изменениях в `backend/**` или в самом workflow):


## API

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/health` | Проверка соединения с БД |
| GET | `/api/products` | Остатки по продуктам (view `product_stock`) |
| GET | `/api/dishes` | Меню с доступными порциями и ценой |
| GET | `/api/stoplist` | Блюда с `portions = 0` |
| GET | `/api/batches` | Живые партии со сроками, истекающие и просроченные |
| GET | `/api/orders` | История заказов |
| POST | `/api/orders` | Заказ с FEFO-списанием |
| POST | `/api/deliveries` | Приём поставки |
| GET | `/api/hot-offers` | Горячие предложения с объяснением |
| GET | `/api/restock` | Что закупить |
| GET | `/api/writeoffs?days=N` | Аналитика списаний |
| POST | `/api/writeoffs` | Ручное списание просрочки |

Примеры:

```powershell
Invoke-RestMethod http://localhost:8081/health
Invoke-RestMethod http://localhost:8081/api/products
Invoke-RestMethod http://localhost:8081/api/dishes
```

### Примеры запросов

**Создание поставки:**

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

**Создание заказа:**

```json
{
  "items": [
    { "dish_id": "UUID-супа", "quantity": 2 },
    { "dish_id": "UUID-омлета", "quantity": 1 }
  ]
}
```

**Списание просрочки (все партии):**

```json
{}
```

**Списание конкретных партий:**

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

## Миграции

Миграции в `backend/migrations/`, совместимы с `golang-migrate`.

Накатить:

```bash
migrate -path ./migrations -database "$DATABASE_URL" up
```

Откатить всё:

```bash
migrate -path ./migrations -database "$DATABASE_URL" down -all
```

## Правила работы в команде

### Ветки

| Ветка | Назначение |
|-------|------------|
| `main` | Стабильная. Только через Pull Request. |
| `dev` | Основная для разработки. |


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

Когда проект готов — PR `dev → main`.

### Правила

1. **Пароль Supabase** и `project-ref` — в личке, не в Git.
2. **Миграции накатывает один человек** — владелец проекта Supabase.
3. **Порт 8081** для бэкенда — одинаковый у всех.
4. **`.env` никогда не коммитится.** Если попал — смени пароль Supabase в **Project Settings → Database → Reset password**.
5. **Не используй production `DATABASE_URL` как `TEST_DATABASE_URL`.**

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

## Текущее состояние и следующие шаги

- [x] Backend API и бизнес-логика склада
- [x] SQL-миграции и seed-данные
- [x] Unit- и PostgreSQL integration-тесты backend
- [x] Локальный запуск тестовой БД через Docker Compose
- [x] GitHub Actions workflow: `go vet`, `go test -race`, покрытие
- [x] Web frontend
- [x] Mobile-приложение
- [ ] Проверить зелёный запуск CI в GitHub после первого push workflow и тестов
- [ ] Подготовить production Dockerfile и проверить сборку контейнера
- [ ] Развернуть backend на Railway, оставив Supabase основной БД
- [ ] Настроить безопасный порядок применения миграций и health check при деплое
- [ ] Отдельно настроить CI для frontend/mobile

Деплой пока не настроен: перед публикацией нужен Dockerfile, проверка production-конфигурации и уверенность, что миграции не затрагивают данные неожиданным образом.

## Полезные ссылки

- Репозиторий: https://github.com/IIgiyuuII/restaurant
- Supabase Dashboard: https://supabase.com/dashboard
- golang-migrate: https://github.com/golang-migrate/migrate