export type Product = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  nearest_expiry: string | null;
};

export type StopDish = {
  id: string;
  name: string;
  portions: number;
};

export type Dish = {
  id: string;
  name: string;
  price: number;
  portions: number; // 0 = стоп-лист
};

export type Batch = {
  id: string;
  product_id: string;
  product: string;
  unit: string;
  delivery_number: string;
  initial_quantity: number;
  remaining_quantity: number;
  received_at: string;
  expires_at: string;
  hours_left: number;
  expired: boolean;
};

export type WriteOff = {
  product_id: string;
  product: string;
  unit: string;
  batch_id: string;
  quantity: number;
  expires_at: string;
};

export type Shortage = {
  product_id: string;
  product: string;
  unit: string;
  needed: number;
  available: number;
};

export type OrderResult = {
  id: string;
  number: number;
  status: 'created' | 'rejected';
  reason?: string;
  created_at: string;
  items: { dish_id: string; name: string; quantity: number }[];
  write_offs?: WriteOff[];
  shortages?: Shortage[];
};

export type OrderHistoryEntry = {
  id: string;
  number: number;
  status: 'created' | 'rejected';
  reason?: string;
  created_at: string;
  items: { name: string; quantity: number }[];
};

export type HotReason = {
  product_id: string;
  product: string;
  unit: string;
  batch_id: string;
  quantity: number;
  expires_at: string;
  hours_left: number;
  urgency: number;
  coverage_pct: number;
  points: number;
  text: string;
};

export type HotOffer = {
  dish_id: string;
  name: string;
  price: number;
  portions: number;
  score: number;
  level: 'critical' | 'high' | 'medium';
  hours_left: number;
  summary: string;
  reasons: HotReason[];
};

export type Cart = Record<string, number>;

// ---- Приём поставки и рекомендации по пополнению ----

export type RestockItem = {
  product_id: string;
  name: string;
  unit: string;
  min_stock: number;
  quantity: number;
  status: 'out' | 'low'; // out — нет совсем, low — ниже минимума
  suggested_quantity: number;
  blocked_dishes: number;
};

export type DeliveryBatch = {
  id: string;
  product_id: string;
  product: string;
  unit: string;
  quantity: number;
  shelf_life_hours: number;
  received_at: string;
  expires_at: string;
};

export type DeliveryResult = {
  id: string;
  number: string;
  delivery_date: string;
  created_at: string;
  batches: DeliveryBatch[];
};

// ---- Списание просрочки и аналитика ----

export type ExpiryStat = {
  product_id: string;
  name: string;
  unit: string;
  batches: number;
  quantity: number;
};

export type ExpiryRecord = {
  id: number;
  created_at: string;
  product_id: string;
  product: string;
  unit: string;
  quantity: number;
  delivery_number: string;
  expires_at: string;
};

export type ExpiryReport = {
  days: number;
  total_batches: number;
  by_product: ExpiryStat[];
  recent: ExpiryRecord[];
  auto_check_minutes: number; // 0 — автосписание выключено
};

export type ExpiryWriteOffResult = {
  written_off: number;
  items: { batch_id: string; product_id: string; product: string; unit: string; quantity: number }[];
};
