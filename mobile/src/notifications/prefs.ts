import { KEYS, storage } from '../storage';

export const CATEGORIES = ['expiry', 'stoplist', 'hot', 'restock', 'orders'] as const;
export type Category = (typeof CATEGORIES)[number];

export type NotifPrefs = { enabled: boolean } & Record<Category, boolean>;

export const CATEGORY_INFO: Record<Category, { label: string; hint: string }> = {
  expiry: { label: 'Срок годности', hint: 'Партия истекает через 24 часа и когда срок вышел' },
  stoplist: { label: 'Стоп-лист', hint: 'Блюдо стало недоступным к заказу' },
  hot: { label: 'Горячие предложения', hint: 'Срочно продать, пока продукты не пропали' },
  restock: { label: 'Закупка', hint: 'Продукт закончился совсем' },
  orders: { label: 'Отклонённые заказы', hint: 'Заказ не прошёл из-за нехватки ингредиентов' },
};

export const DEFAULT_PREFS: NotifPrefs = {
  enabled: true,
  expiry: true,
  stoplist: true,
  hot: true,
  restock: true,
  orders: true,
};

export async function loadPrefs(): Promise<NotifPrefs> {
  const saved = await storage.get<Partial<NotifPrefs>>(KEYS.notifPrefs, {});
  return { ...DEFAULT_PREFS, ...saved };
}

export const savePrefs = (p: NotifPrefs) => storage.set(KEYS.notifPrefs, p);
