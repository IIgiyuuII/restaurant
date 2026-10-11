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