import { useCallback, useEffect, useMemo, useState } from 'react';

import Sidebar, { tabFromHash } from './components/Sidebar';
import Header from './components/Header';
import StockTable from './components/StockTable';
import StopList from './components/StopList';
import OrdersPage from './components/OrdersPage';
import HotOffersPage from './components/HotOffersPage';
//import HotOfferCard from './components/HotOfferCard';
import DeliveryPage from './components/DeliveryPage';
import WriteoffsPage from './components/WriteoffsPage';
import Background from './components/Background';
import ErrorBanner from './components/ErrorBanner';
import AnalyticsDashboard from './components/AnalyticsDashboard';

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
import { hoursUntil } from './utils';

// Пока нет SSE — обновляем данные опросом.
const POLL_MS = 10_000;

export default function App() {
  // Текущая вкладка хранится в адресной строке (#stock), поэтому работают «назад» и обновление страницы.
  const [tab, setTabState] = useState(() => tabFromHash(window.location.hash));
  const setTab = useCallback((id: string) => {
    setTabState(id);
    if (tabFromHash(window.location.hash) !== id) window.location.hash = id;
  }, []);
  useEffect(() => {
    const onHash = () => setTabState(tabFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
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

  //const emptyProducts = products.filter((p) => p.quantity === 0).length;

  // Считаем по партиям: срок годности — свойство партии, а не продукта.
  //const { expiringSoon, expired } = useMemo(() => {
    //let soon = 0;
    //let gone = 0;
    //for (const b of batches) {
      //const h = hoursUntil(b.expires_at);
      //if (h <= 0) gone++;
      //else if (h < 24) soon++;
    //}
    //return { expiringSoon: soon, expired: gone };
  //}, [batches]);

  const expired = useMemo(() => {
  let gone = 0;
  for (const b of batches) {
    if (hoursUntil(b.expires_at) <= 0) gone++;
  }
  return gone;
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

  const selectTab = (id: string) => {
    setTab(id);
    setMenuOpen(false);
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      <Background />
      <Sidebar
        active={tab}
        onChange={selectTab}
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
            <AnalyticsDashboard
              products={products}
              stoplist={stoplist}
              batches={batches}
              history={history}
              hotOffers={hotOffers}
              restock={restock}
              report={report}
              onNavigate={selectTab}
            />
          )}

          <div
            key={tab}
            className={tab === 'dashboard' || tab === 'delivery' || tab === 'hot' ? undefined : 'animate-fade-up'}
          >
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
          </div>
        </main>
      </div>
    </div>
  );
}
