-- Снимок цены блюда и итоговой выручки заказа.
ALTER TABLE orders
    ADD COLUMN revenue numeric(12,2) NOT NULL DEFAULT 0 CHECK (revenue >= 0),
    ADD COLUMN revenue_estimated boolean NOT NULL DEFAULT false;

ALTER TABLE order_items
    ADD COLUMN unit_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0);

-- Для уже существующих заказов историческая цена неизвестна:
-- используем текущую цену блюда и явно помечаем сумму как оценочную.
UPDATE order_items oi
   SET unit_price = d.price
  FROM dishes d
 WHERE d.id = oi.dish_id;

UPDATE orders o
   SET revenue = COALESCE((
       SELECT SUM(oi.quantity * oi.unit_price)
         FROM order_items oi
        WHERE oi.order_id = o.id
   ), 0),
       revenue_estimated = true;
