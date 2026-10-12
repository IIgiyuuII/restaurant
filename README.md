# Restaurant Inventory — учёт продуктов, партий и стоп-листа

Хакатон-проект: система для ресторана, которая ведёт учёт продуктов по партиям (поставкам) со сроками годности, обрабатывает заказы со списанием ингредиентов по FEFO, автоматически формирует стоп-лист блюд и (в планах) «горячие предложения».

## Стек

| Слой | Технологии |
|------|------------|
| Backend | Go 1.22+, chi/v5, pgx/v5, golang-migrate |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 + axios |
| БД | PostgreSQL 17 (Supabase, Session Pooler) |
| DevOps | Git, GitHub, Supabase Dashboard |

## Что уже реализовано

### Бэкенд

- [x] Слоистая архитектура: `handlers` → `services` → `models`
- [x] Схема БД: продукты, поставки, партии, блюда, рецепты, заказы, журнал движений
- [x] Представления `product_stock` и `dish_availability` (стоп-лист)
- [x] Миграции `golang-migrate` (init + seed справочников + seed поставок)
- [x] Типизированные ошибки: `ValidationError → 400`, `ConflictError → 409`
- [x] **POST `/api/deliveries`** — приём поставки: создание партий + запись `receipt` в журнал
- [x] **POST `/api/orders`** — заказ с FEFO-списанием: блокировка партий, проверка наличия, отказ при нехватке, запись `order` в журнал
- [x] **GET `/api/dishes`** — меню с количеством доступных порций
- [x] **GET `/api/products`** — остатки по продуктам (view `product_stock`)
- [x] **GET `/api/stoplist`** — блюда с `portions = 0`
- [x] **GET `/health`** — проверка соединения с БД

### Фронтенд

- [x] Дашборд: 4 карточки статистики (продукты, нет в наличии, истекают <24ч, в стоп-листе)
- [x] Таблица остатков с цветовой индикацией сроков
- [x] Стоп-лист
- [x] Тёмная тема, сайдбар, адаптивная вёрстка
- [ ] Форма поставки
- [ ] Форма заказа
- [ ] Страница горячих предложений
- [ ] Страница заказов (история)

### Бонусы (в планах)

- [ ] Горячие предложения: алгоритм скоринга + эндпоинт
- [ ] Автосписание просрочки (фоновый воркер)
- [ ] SSE для обновлений в реальном времени
- [ ] Генератор событий (эмуляция поставок и заказов)
- [ ] Аналитика и прогноз стоп-листа
- [ ] Деплой (Railway/Fly.io + Vercel)
- [ ] Grafana-дашборд

## Структура проекта

```
restaurant/
├── backend/
│   ├── cmd/api/main.go                 # точка входа, роутер, CORS
│   ├── internal/
│   │   ├── db/db.go                    # pgxpool + simple protocol для pooler
│   │   ├── handlers/handlers.go        # HTTP-слой
│   │   ├── services/
│   │   │   ├── delivery.go             # приём поставок
│   │   │   ├── orders.go               # FEFO-заказы
│   │   │   └── errors.go               # ValidationError, ConflictError, pgCode
│   │   └── models/
│   │       ├── delivery.go             # DTO поставок
│   │       └── order.go                # DTO заказов и меню
│   ├── migrations/
│   └── go.mod
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── StatCard.tsx
│   │   │   ├── StockTable.tsx
│   │   │   └── StopList.tsx
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
DATABASE_URL=postgresql://postgres.djfskodfjsdfj:ТВОЙ_ПАРОЛЬ@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
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

### GET-эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Проверка соединения с БД |
| GET | `/api/products` | Остатки по всем продуктам (из view `product_stock`) |
| GET | `/api/stoplist` | Блюда с `portions = 0` |
| GET | `/api/dishes` | Меню с количеством доступных порций и ценой |

### POST `/api/deliveries` — приём поставки

**Тело запроса:**

```json
{
  "number": "D-20261012-0001",
  "delivery_date": "2026-10-12T10:00:00Z",
  "items": [
    { "product_id": "UUID-молока", "quantity": 5000, "shelf_life_hours": 48 },
    { "product_id": "UUID-муки",   "quantity": 8000, "shelf_life_hours": 4320 }
  ]
}
```

`number` и `delivery_date` **необязательны** — сгенерируются автоматически.

**Что происходит:** создаётся `deliveries` → для каждой позиции создаётся `batch` (`expires_at = received_at + shelf_life`) → пишется `receipt` в `stock_movements`. Всё в одной транзакции.

**Ответ:** `201 Created` с созданными партиями или `409 Conflict`, если номер поставки уже существует.

### POST `/api/orders` — создание заказа с FEFO

**Тело запроса:**

```json
{
  "items": [
    { "dish_id": "UUID-супа", "quantity": 2 },
    { "dish_id": "UUID-омлета", "quantity": 1 }
  ]
}
```

**Что происходит:**

1. Валидация и склейка повторяющихся блюд.
2. Раскладка блюд на ингредиенты (через `dish_ingredients`).
3. Блокировка живых партий (`FOR UPDATE`) в детерминированном порядке (защита от дедлоков).
4. **Если чего-то не хватает:** `ROLLBACK`, заказ сохраняется как `rejected`, возврат **409 Conflict** с причиной.
5. **Если хватает:** создаётся `orders` + `order_items`, партии списываются по FEFO (`ORDER BY expires_at`), при обнулении `status='depleted'`, пишется `order` в журнал. Всё в одной транзакции.

**Ответ `201 Created` при успехе:**

```json
{
  "id": "...",
  "number": 1,
  "status": "created",
  "created_at": "...",
  "items": [...],
  "write_offs": [
    { "product": "Курица", "batch_id": "...", "quantity": 400, "expires_at": "..." }
  ]
}
```

**Ответ `409 Conflict` при нехватке:**

```json
{
  "id": "...",
  "number": 2,
  "status": "rejected",
  "reason": "Не хватает: Бекон — нужно 100 г, есть 0 г",
  "shortages": [
    { "product": "Бекон", "unit": "g", "needed": 100, "available": 0 }
  ]
}
```

### Примеры через curl

```bash
# Здоровье
curl.exe http://localhost:8081/health

# Остатки
curl.exe http://localhost:8081/api/products

# Стоп-лист
curl.exe http://localhost:8081/api/stoplist

# Меню с порциями
curl.exe http://localhost:8081/api/dishes

# Создать поставку
curl.exe -X POST http://localhost:8081/api/deliveries ^
  -H "Content-Type: application/json" ^
  -d "{\"items\":[{\"product_id\":\"UUID\",\"quantity\":5000,\"shelf_life_hours\":48}]}"

# Создать заказ
curl.exe -X POST http://localhost:8081/api/orders ^
  -H "Content-Type: application/json" ^
  -d "{\"items\":[{\"dish_id\":\"UUID\",\"quantity\":1}]}"
```


## Модель данных

### Таблицы

- **products** — справочник продуктов: `id`, `name`, `unit` (`g`/`ml`/`pcs`), `min_stock`.
- **deliveries** — поставки: `id`, `number` (UNIQUE), `delivery_date`, `created_at`.
- **batches** — партии: `delivery_id`, `product_id`, `initial_quantity`, `remaining_quantity`, `shelf_life` (interval), `received_at`, `expires_at`, `status` (`active`/`depleted`/`expired`), `updated_at`.
- **dishes** — блюда: `id`, `name`, `price`, `is_active`.
- **dish_ingredients** — рецепты: `(dish_id, product_id, quantity)`.
- **orders** — заказы: `id`, `number` (identity), `status` (`created`/`rejected`), `reason`, `created_at`.
- **order_items** — позиции заказа: `(order_id, dish_id, quantity)`.
- **stock_movements** — append-only журнал: `batch_id`, `product_id`, `type` (`receipt`/`order`/`expired_writeoff`/`adjustment`), `delta`, `order_id`, `created_at`.

### Представления

- **product_stock** — суммарные остатки по продуктам, только по живым непросроченным партиям. Считает `total_quantity` и `nearest_expiry`.
- **dish_availability** — сколько порций блюда можно приготовить (`MIN` по ингредиентам). `portions = 0` = блюдо в стоп-листе.

### Ключевые правила

- **Остатки хранятся по партиям**, а не одним числом — иначе теряются сроки годности.
- **FEFO** (First Expired, First Out): списание с `ORDER BY expires_at` среди `status='active' AND expires_at > now() AND remaining_quantity > 0`.
- **Стоп-лист** — не таблица, а представление: нечему рассинхронизироваться.
- **`stock_movements`** — журнал для аналитики и аудита; изменение остатка партии и запись в журнал происходят в одной транзакции.
- **`numeric(12,3)`** вместо `float` для точной арифметики граммов/миллилитров.
- **`uuid`** как внешние идентификаторы (требование кейса).

## Правила работы в команде

### Ветки

| Ветка | Назначение |
|-------|------------|
| `main` | Стабильная. Только через Pull Request. |
| `dev` | Основная для разработки. Feature-ветки создаются от неё. |
| `feature/<название>` | Под каждую задачу. Вливается в `dev` через PR. |



## Горячие предложения (план)

Скор блюда по его ингредиентам:

```
score(dish) = Σ по ингредиентам  w_urgency(часы до expires_at) × доля партии, которую блюдо съедает
```

- Чем меньше часов до истечения — тем выше вес.
- Учитываем, в скольких блюдах используется ингредиент (чем больше — тем ниже приоритет отдать его именно этому блюду).
- Отбрасываем блюда из стоп-листа.
- Причина формируется автоматически: «Молоко: партия истекает через 5 ч, осталось 3 л».

