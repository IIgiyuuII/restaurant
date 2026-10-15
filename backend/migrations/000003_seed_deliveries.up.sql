-- Тестовые поставки. Времена заданы относительно момента накатки миграции,
-- чтобы сразу было видно разные сценарии: истекающие партии (через ~5-6 ч),
-- свежие партии, продукт без партий (Бекон -> Паста Карбонара в стоп-листе).

INSERT INTO deliveries (number, delivery_date) VALUES
('SEED-001', now() - interval '43 hours'),
('SEED-002', now() - interval '30 hours'),
('SEED-003', now() - interval '4 hours');

-- (поставка, продукт, количество в базовых единицах, срок хранения в часах)
INSERT INTO batches (delivery_id, product_id, initial_quantity, remaining_quantity,
                     shelf_life, received_at, expires_at)
SELECT d.id, p.id, v.qty, v.qty,
       v.shelf_hours * interval '1 hour',
       d.delivery_date,
       d.delivery_date + v.shelf_hours * interval '1 hour'
FROM (VALUES
  -- SEED-001: пришла 43 ч назад
  ('SEED-001', 'Молоко',          3000,  48),   -- истекает через ~5 ч
  ('SEED-001', 'Мука',            8000, 4320),
  ('SEED-001', 'Курица',          6000,  72),   -- ~29 ч
  ('SEED-001', 'Томаты',          2500, 120),
  ('SEED-001', 'Тесто',           3000,  72),   -- ~29 ч
  -- SEED-002: пришла 30 ч назад
  ('SEED-002', 'Салат',            400,  36),   -- истекает через ~6 ч
  ('SEED-002', 'Сыр Моцарелла',    800,  72),
  ('SEED-002', 'Яйцо',              40, 336),
  ('SEED-002', 'Соус томатный',   3000, 720),
  -- SEED-003: пришла 4 ч назад
  ('SEED-003', 'Молоко',         10000, 168),
  ('SEED-003', 'Сыр Моцарелла',   1200, 336),
  ('SEED-003', 'Тесто',           2000,  48),
  ('SEED-003', 'Томаты',          1500,  96)
) AS v(delivery_number, product_name, qty, shelf_hours)
JOIN deliveries d ON d.number = v.delivery_number
JOIN products   p ON p.name   = v.product_name;

-- Приход в журнал движений
INSERT INTO stock_movements (batch_id, product_id, type, delta, created_at)
SELECT b.id, b.product_id, 'receipt', b.initial_quantity, b.received_at
FROM batches b
JOIN deliveries d ON d.id = b.delivery_id
WHERE d.number LIKE 'SEED-%';
