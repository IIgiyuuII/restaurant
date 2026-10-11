-- Расширение для gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ Справочники ============

CREATE TABLE products (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE,
    unit        text NOT NULL CHECK (unit IN ('g','ml','pcs')),
    min_stock   numeric(12,3) NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============ Поставки и партии ============

CREATE TABLE deliveries (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number        text NOT NULL UNIQUE,
    delivery_date timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE batches (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id         uuid NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
    product_id          uuid NOT NULL REFERENCES products(id),
    initial_quantity    numeric(12,3) NOT NULL CHECK (initial_quantity > 0),
    remaining_quantity  numeric(12,3) NOT NULL CHECK (remaining_quantity >= 0),
    shelf_life          interval NOT NULL,
    received_at         timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL,
    status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','depleted','expired')),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (remaining_quantity <= initial_quantity),
    CHECK (expires_at > received_at)
);

-- Горячий путь: FEFO-выборка живых партий продукта
CREATE INDEX idx_batches_fefo
    ON batches (product_id, expires_at)
    WHERE status = 'active' AND remaining_quantity > 0;

-- Для воркера автосписания и «истекающих»
CREATE INDEX idx_batches_expiry
    ON batches (expires_at) WHERE status = 'active';

-- ============ Блюда и рецепты ============

CREATE TABLE dishes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE,
    price       numeric(10,2) NOT NULL CHECK (price >= 0),
    is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE dish_ingredients (
    dish_id     uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
    product_id  uuid NOT NULL REFERENCES products(id),
    quantity    numeric(12,3) NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (dish_id, product_id)
);
CREATE INDEX idx_dish_ingredients_product ON dish_ingredients (product_id);

-- ============ Заказы ============

CREATE TABLE orders (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number      bigint GENERATED ALWAYS AS IDENTITY,
    status      text NOT NULL DEFAULT 'created'
                CHECK (status IN ('created','rejected')),
    reason      text,  -- причина отказа, если rejected
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dish_id     uuid NOT NULL REFERENCES dishes(id),
    quantity    int  NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (order_id, dish_id)
);

-- ============ Журнал движений (append-only) ============

CREATE TABLE stock_movements (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id    uuid NOT NULL REFERENCES batches(id),
    product_id  uuid NOT NULL REFERENCES products(id),
    type        text NOT NULL CHECK (type IN ('receipt','order','expired_writeoff','adjustment')),
    delta       numeric(12,3) NOT NULL,
    order_id    uuid REFERENCES orders(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_product_time ON stock_movements (product_id, created_at);
CREATE INDEX idx_movements_type_time    ON stock_movements (type, created_at);

-- ============ Представления ============

-- Остатки по продукту: только живые непросроченные партии
CREATE VIEW product_stock AS
SELECT p.id AS product_id, p.name, p.unit, p.min_stock,
       COALESCE(SUM(b.remaining_quantity), 0) AS total_quantity,
       MIN(b.expires_at) AS nearest_expiry
FROM products p
LEFT JOIN batches b ON b.product_id = p.id
     AND b.status = 'active' AND b.expires_at > now()
GROUP BY p.id;

-- Сколько порций блюда можно приготовить сейчас; 0 = стоп-лист
CREATE VIEW dish_availability AS
SELECT d.id AS dish_id, d.name, d.price,
       COALESCE(MIN(floor(COALESCE(ps.total_quantity,0) / di.quantity)), 0)::int AS portions
FROM dishes d
JOIN dish_ingredients di ON di.dish_id = d.id
LEFT JOIN product_stock ps ON ps.product_id = di.product_id
WHERE d.is_active
GROUP BY d.id;