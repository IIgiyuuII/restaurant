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
