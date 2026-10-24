import type { IconName } from '../ui/Icon';
import type { TabId } from '../notifications/events';

export const NAV: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: 'dashboard' },
  { id: 'stock', label: 'Остатки', icon: 'box' },
  { id: 'stoplist', label: 'Стоп-лист', icon: 'ban' },
  { id: 'hot', label: 'Горячие', icon: 'flame' },
  { id: 'orders', label: 'Заказы', icon: 'receipt' },
  { id: 'delivery', label: 'Поставка', icon: 'truck' },
  { id: 'writeoffs', label: 'Списание', icon: 'trash' },
];

export const TITLES: Record<TabId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Дашборд', subtitle: 'Обзор склада и стоп-листа' },
  stock: { title: 'Остатки', subtitle: 'Нажмите на продукт, чтобы раскрыть партии' },
  stoplist: { title: 'Стоп-лист', subtitle: 'Блюда, недоступные к заказу' },
  hot: { title: 'Горячие предложения', subtitle: 'Что выгодно продать первым, чтобы продукты не пропали' },
  orders: { title: 'Заказы', subtitle: 'Оформление заказов со списанием по FEFO' },
  delivery: { title: 'Приём поставки', subtitle: 'Новые партии со сроком годности и что нужно заказать' },
  writeoffs: { title: 'Списание', subtitle: 'Просроченные партии и аналитика потерь' },
};
