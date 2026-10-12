DELETE FROM stock_movements WHERE batch_id IN (
  SELECT b.id FROM batches b JOIN deliveries d ON d.id = b.delivery_id WHERE d.number LIKE 'SEED-%');
DELETE FROM batches WHERE delivery_id IN (SELECT id FROM deliveries WHERE number LIKE 'SEED-%');
DELETE FROM deliveries WHERE number LIKE 'SEED-%';
