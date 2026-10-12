import { useCallback, useEffect, useMemo, useState } from 'react';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatCard from './components/StatCard';
import StockTable from './components/StockTable';
import StopList from './components/StopList';
import OrdersPage from './components/OrdersPage';
import HotOffersPage from './components/HotOffersPage';
import HotOfferCard from './components/HotOfferCard';

import { api, errorMessage } from './api';
import type { Batch, Cart, Dish, HotOffer, OrderHistoryEntry, Product, StopDish } from './types';
import { hoursUntil } from './utils';

// Пока нет SSE — обновляем данные опросом.
const POLL_MS = 10_000;

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [stoplist, setStoplist] = useState<StopDish[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [hotOffers, setHotOffers] = useState<HotOffer[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, s, b, d, h, hot] = await Promise.all([
        api.get<Product[]>('/products'),
        api.get<StopDish[]>('/stoplist'),
        api.get<Batch[]>('/batches'),
        api.get<Dish[]>('/dishes'),
        api.get<OrderHistoryEntry[]>('/orders'),
        api.get<HotOffer[]>('/hot-offers'),
      ]);
      setProducts(p.data);
      setStoplist(s.data);
      setBatches(b.data);
      setDishes(d.data);
      setHistory(h.data);
      setHotOffers(hot.data);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    // Первичная загрузка с сервера: setState вызывается после await, а не синхронно.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const addToCart = (o: HotOffer) =>
    setCart((prev) => ({
      ...prev,
      [o.dish_id]: Math.min((prev[o.dish_id] ?? 0) + 1, o.portions),
    }));

  const emptyProducts = products.filter((p) => p.quantity === 0).length;

  // Считаем по партиям: срок годности — свойство партии, а не продукта.
  const { expiringSoon, expired } = useMemo(() => {
    let soon = 0;
    let gone = 0;
    for (const b of batches) {
      const h = hoursUntil(b.expires_at);
      if (h <= 0) gone++;
      else if (h < 24) soon++;
    }
    return { expiringSoon: soon, expired: gone };
  }, [batches]);

  const titles: Record<string, { title: string; subtitle?: string }> = {
    dashboard: { title: 'Дашборд', subtitle: 'Обзор склада и стоп-листа' },
    stock: { title: 'Остатки', subtitle: 'Продукты и партии — нажмите на строку, чтобы раскрыть партии' },
    stoplist: { title: 'Стоп-лист', subtitle: 'Блюда, недоступные к заказу' },
    hot: { title: 'Горячие предложения', subtitle: 'Что выгодно продать в первую очередь, чтобы продукты не пропали' },
    orders: { title: 'Заказы', subtitle: 'Оформление заказов со списанием по FEFO' },
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={tab} onChange={setTab} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={titles[tab].title} subtitle={titles[tab].subtitle} />

        <main className="flex-1 overflow-y-auto p-8">
          {!loaded && !error && <div className="text-gray-500">Загрузка…</div>}

          {error && (
            <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 text-red-300 p-4">
              Ошибка: {error}. Проверь, что Go-сервер запущен на порту 8081.
            </div>
          )}

          {loaded && tab === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard label="Продуктов" value={products.length} accent="gray" />
                <StatCard
                  label="Нет в наличии"
                  value={emptyProducts}
                  accent={emptyProducts > 0 ? 'red' : 'emerald'}
                  hint="партий нет или закончились"
                />
                <StatCard
                  label="Партий истекает <24ч"
                  value={expiringSoon}
                  accent={expiringSoon > 0 ? 'yellow' : 'emerald'}
                  hint={
                    expired > 0
                      ? `и ещё ${expired} просрочено — нужно списать`
                      : 'нужно срочно использовать'
                  }
                />
                <StatCard
                  label="В стоп-листе"
                  value={stoplist.length}
                  accent={stoplist.length > 0 ? 'red' : 'emerald'}
                />
              </div>

              {hotOffers.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm uppercase tracking-wide text-gray-500">
                      Горячие предложения
                    </h2>
                    <button
                      onClick={() => setTab('hot')}
                      className="text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      Все предложения →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {hotOffers.slice(0, 3).map((o, i) => (
                      <HotOfferCard
                        key={o.dish_id}
                        offer={o}
                        rank={i + 1}
                        topScore={hotOffers[0].score}
                        inCart={cart[o.dish_id] ?? 0}
                        onAdd={() => addToCart(o)}
                        compact
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-sm uppercase tracking-wide text-gray-500 mb-3">
                  Стоп-лист
                </h2>
                <StopList dishes={stoplist} />
              </section>

              <section>
                <h2 className="text-sm uppercase tracking-wide text-gray-500 mb-3">
                  Остатки
                </h2>
                <StockTable products={products} batches={batches} />
              </section>
            </div>
          )}

          {loaded && tab === 'stock' && <StockTable products={products} batches={batches} />}
          {loaded && tab === 'stoplist' && <StopList dishes={stoplist} />}
          {loaded && tab === 'orders' && (
            <OrdersPage
              dishes={dishes}
              history={history}
              cart={cart}
              setCart={setCart}
              onChanged={refresh}
            />
          )}
          {loaded && tab === 'hot' && (
            <HotOffersPage
              offers={hotOffers}
              cart={cart}
              onAdd={addToCart}
              onOpenOrders={() => setTab('orders')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
