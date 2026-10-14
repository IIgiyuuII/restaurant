import { useCallback, useEffect, useMemo, useState } from 'react';

import Sidebar, { tabFromHash } from './components/Sidebar';
import Header from './components/Header';
import StatCard from './components/StatCard';
import StockTable from './components/StockTable';
import StopList from './components/StopList';
import OrdersPage from './components/OrdersPage';
import HotOffersPage from './components/HotOffersPage';
import HotOfferCard from './components/HotOfferCard';
import DeliveryPage from './components/DeliveryPage';
import WriteoffsPage from './components/WriteoffsPage';
import DonutChart from './components/DonutChart';
import Background from './components/Background';
import ErrorBanner from './components/ErrorBanner';
import SectionTitle from './components/SectionTitle';


import { api, errorMessage } from './api';
import type {
  Batch,
  Cart,
  Dish,
  ExpiryReport,
  HotOffer,
  OrderHistoryEntry,
  Product,
  RestockItem,
  StopDish,
} from './types';
import { hoursUntil, plural } from './utils';

// Пока нет SSE — обновляем данные опросом.
const POLL_MS = 10_000;

export default function App() {
    // Начальное значение — сразу из URL, чтобы F5 на #/orders открывал «Заказы».
  const [tab, setTab] = useState(() => tabFromHash(window.location.hash));
  const [products, setProducts] = useState<Product[]>([]);
  const [stoplist, setStoplist] = useState<StopDish[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [hotOffers, setHotOffers] = useState<HotOffer[]>([]);
  const [restock, setRestock] = useState<RestockItem[]>([]);
  const [report, setReport] = useState<ExpiryReport | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cart, setCart] = useState<Cart>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, s, b, d, h, hot, rs, rep] = await Promise.all([
        api.get<Product[]>('/products'),
        api.get<StopDish[]>('/stoplist'),
        api.get<Batch[]>('/batches'),
        api.get<Dish[]>('/dishes'),
        api.get<OrderHistoryEntry[]>('/orders'),
        api.get<HotOffer[]>('/hot-offers'),
        api.get<RestockItem[]>('/restock'),
        api.get<ExpiryReport>('/writeoffs', { params: { days: 30 } }),
      ]);
      setProducts(p.data);
      setStoplist(s.data);
      setBatches(b.data);
      setDishes(d.data);
      setHistory(h.data);
      setHotOffers(hot.data);
      setRestock(rs.data);
      setReport(rep.data);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

    // «Назад»/«Вперёд» браузера и прямые ссылки — всё идёт через hashchange.
  useEffect(() => {
    const onHash = () => setTab(tabFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
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
    delivery: { title: 'Приём поставки', subtitle: 'Новые партии со сроком годности и что нужно заказать' },
    writeoffs: { title: 'Списание', subtitle: 'Просроченные партии и аналитика потерь' },
  };


  return (
    <div className="flex h-dvh overflow-hidden">
      <Background />
      <Sidebar
        active={tab}
        onNavigate={() => setMenuOpen(false)}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        badges={{ delivery: restock.length, writeoffs: expired }}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          title={titles[tab].title}
          subtitle={titles[tab].subtitle}
          onMenu={() => setMenuOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 pt-5 md:p-8 md:pt-6">
          {!loaded && !error && <div className="text-gray-500">Загрузка…</div>}

          {error && (
            <ErrorBanner message={error} onRetry={() => void refresh()} onClose={() => setError(null)} />
          )}

          {loaded && tab === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <StatCard
                  label="Продуктов"
                  value={products.length}
                  hint="всего в наличии"
                  accent="neutral"
                  icon="box"
                  onClick={() => setTab('stock')}
                />
                <StatCard
                  label="Нет в наличии"
                  value={emptyProducts}
                  hint="партий нет или закончились"
                  accent={emptyProducts > 0 ? 'slate' : 'green'}
                  icon="ban"
                  onClick={() => setTab('stock')}
                />
                <StatCard
                  label="Партий истекает <24ч"
                  value={expiringSoon}
                  hint={
                    expired > 0
                      ? `и ещё ${expired} просрочено — нужно списать`
                      : 'нужно срочно использовать'
                  }
                  accent={expiringSoon > 0 ? 'orange' : 'green'}
                  icon="clock"
                  onClick={() => setTab(expired > 0 ? 'writeoffs' : 'stock')}
                />
                <StatCard
                  label="В стоп-листе"
                  value={stoplist.length}
                  hint="позиций"
                  accent={stoplist.length > 0 ? 'indigo' : 'green'}
                  icon="flame"
                  onClick={() => setTab('stoplist')}
                />
              </div>

              {hotOffers.length > 0 && (
                <section>
                  <SectionTitle icon="flame" action={{ label: 'Все предложения', onClick: () => setTab('hot') }}>
                    Горячие предложения
                  </SectionTitle>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {hotOffers.slice(0, 3).map((o, i) => (
                      // Третья карточка — только на очень широких экранах, чтобы сетка из 2 колонок не оставляла дыру.
                      <div key={o.dish_id} className={i === 2 ? 'hidden 2xl:contents' : 'contents'}>
                        <HotOfferCard
                          offer={o}
                          rank={i + 1}
                          topScore={hotOffers[0].score}
                          inCart={cart[o.dish_id] ?? 0}
                          onAdd={() => addToCart(o)}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <StopList dishes={stoplist} compact onAll={() => setTab('stoplist')} />
              </section>

              <section>
                <SectionTitle
                  icon="trash"
                  action={{ label: 'Подробнее', onClick: () => setTab('writeoffs') }}
                >
                  Списания за {report?.days ?? 30} дн.
                </SectionTitle>
                <div className="bg-surface rounded-2xl border border-gray-800 p-4 sm:p-5">
                  {report && report.total_batches > 0 ? (
                    <DonutChart
                      slices={report.by_product.map((s) => ({ label: s.name, value: s.batches }))}
                      centerValue={report.total_batches}
                      centerLabel={plural(report.total_batches, ['партия', 'партии', 'партий'])}
                      formatValue={(v) => `${v} ${plural(v, ['партия', 'партии', 'партий'])}`}
                    />
                  ) : (
                    <div className="py-8 text-center text-sm text-gray-500">
                      Просрочку не списывали — потерь нет 🎉
                    </div>
                  )}
                </div>
              </section>

              <section>
                <SectionTitle icon="box" action={{ label: 'Все остатки', onClick: () => setTab('stock') }}>
                  Остатки
                </SectionTitle>
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
          {loaded && tab === 'delivery' && (
            <DeliveryPage products={products} restock={restock} onChanged={refresh} />
          )}
          {loaded && tab === 'writeoffs' && (
            <WriteoffsPage batches={batches} report={report} onChanged={refresh} />
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
