ALTER TABLE order_items DROP COLUMN IF EXISTS unit_price;
ALTER TABLE orders DROP COLUMN IF EXISTS revenue_estimated;
ALTER TABLE orders DROP COLUMN IF EXISTS revenue;
