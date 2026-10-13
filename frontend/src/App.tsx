
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
import type {
  Batch,
  Cart,
  Dish,
  HotOffer,
  OrderHistoryEntry,
  Product,
  StopDish,
} from './types';
import { hoursUntil } from './utils';

const POLL_MS = 10_000;
const DESKTOP_QUERY = '(min-width: 768px)';

export default function App() {
  const [tab, setTab] = useState('dashboard');

  const [menuOpen, setMenuOpen] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(DESKTOP_QUERY).matches,
  );

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
    void refresh();

    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [refresh]);

  
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);

    const handleBreakpoint = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setMenuOpen(false);
      }
    };

    media.addEventListener('change', handleBreakpoint);

    return () => {
      media.removeEventListener('change', handleBreakpoint);
    };
  }, []);


  const selectTab = (nextTab: string) => {
    setTab(nextTab);

    if (!window.matchMedia(DESKTOP_QUERY).matches) {
      setMenuOpen(false);
    }
  };

  const toggleMenu = () => {
    setMenuOpen((prev) => !prev);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const addToCart = (offer: HotOffer) => {
    setCart((prev) => ({
      ...prev,
      [offer.dish_id]: Math.min(
        (prev[offer.dish_id] ?? 0) + 1,
        offer.portions,
      ),
    }));
  };

  const emptyProducts = products.filter(
    (product) => product.quantity === 0,
  ).length;

  const cartCount = Object.values(cart).reduce(
    (total, count) => total + count,
    0,
  );

  const { expiringSoon, expired } = useMemo(() => {
    let soon = 0;
    let gone = 0;

    for (const batch of batches) {
      const hours = hoursUntil(batch.expires_at);

      if (hours <= 0) {
        gone++;
      } else if (hours < 24) {
        soon++;
      }
    }

    return { expiringSoon: soon, expired: gone };
  }, [batches]);

  const titles: Record<
    string,
    { title: string; subtitle?: string }
  > = {
    dashboard: {
      title: 'Дашборд',
      subtitle: 'Обзор склада и стоп-листа',
    },
    stock: {
      title: 'Остатки',
      subtitle:
        'Продукты и партии — нажмите на строку, чтобы раскрыть партии',
    },
    stoplist: {
      title: 'Стоп-лист',
      subtitle: 'Блюда, недоступные к заказу',
    },
    hot: {
      title: 'Горячие предложения',
      subtitle:
        'Что выгодно продать в первую очередь, чтобы продукты не пропали',
    },
    orders: {
      title: 'Заказы',
      subtitle: 'Оформление заказов со списанием по FEFO',
    },
  };

  const currentTitle = titles[tab] ?? titles.dashboard;

  return (
    <div className="flex h-dvh min-h-0 w-full min-w-0 overflow-hidden bg-[#0b0f19]">
      <Sidebar
        active={tab}
        onChange={selectTab}
        open={menuOpen}
        onClose={closeMenu}
        cartCount={cartCount}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          title={currentTitle.title}
          subtitle={currentTitle.subtitle}
          onMenu={toggleMenu}
          menuOpen={menuOpen}
        />

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 lg:p-8">
          <div className="mx-auto w-full min-w-0">
            {!loaded && !error && (
              <div className="py-6 text-sm text-gray-500">
                Загрузка…
              </div>
            )}

            {error && (
              <div className="mb-6 break-words rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
                Ошибка: {error}. Проверь, что Go-сервер запущен на порту 8081.
              </div>
            )}

            {loaded && tab === 'dashboard' && (
              <div className="min-w-0 space-y-6 sm:space-y-8">
                <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                  <StatCard
                    label="Продуктов"
                    value={products.length}
                    accent="gray"
                  />

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
                  <section className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm uppercase tracking-wide text-gray-500">
                        Горячие предложения
                      </h2>

                      <button
                        type="button"
                        onClick={() => selectTab('hot')}
                        className="shrink-0 text-sm text-emerald-400 hover:text-emerald-300"
                      >
                        Все предложения →
                      </button>
                    </div>

                    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                      {hotOffers.slice(0, 3).map((offer, index) => (
                        <HotOfferCard
                          key={offer.dish_id}
                          offer={offer}
                          rank={index + 1}
                          topScore={hotOffers[0].score}
                          inCart={cart[offer.dish_id] ?? 0}
                          onAdd={() => addToCart(offer)}
                          compact
                        />
                      ))}
                    </div>
                  </section>
                )}

                <section className="min-w-0">
                  <h2 className="mb-3 text-sm uppercase tracking-wide text-gray-500">
                    Стоп-лист
                  </h2>
                  <div className="min-w-0 max-w-full">
                    <StopList dishes={stoplist} />
                  </div>
                </section>

                <section className="min-w-0">
                  <h2 className="mb-3 text-sm uppercase tracking-wide text-gray-500">
                    Остатки
                  </h2>
                  <div className="min-w-0 max-w-full overflow-x-auto">
                    <StockTable
                      products={products}
                      batches={batches}
                    />
                  </div>
                </section>
              </div>
            )}

            {loaded && tab === 'stock' && (
              <div className="min-w-0 max-w-full overflow-x-auto">
                <StockTable products={products} batches={batches} />
              </div>
            )}

            {loaded && tab === 'stoplist' && (
              <div className="min-w-0 max-w-full">
                <StopList dishes={stoplist} />
              </div>
            )}

            {loaded && tab === 'orders' && (
              <div className="min-w-0 max-w-full">
                <OrdersPage
                  dishes={dishes}
                  history={history}
                  cart={cart}
                  setCart={setCart}
                  onChanged={refresh}
                />
              </div>
            )}

            {loaded && tab === 'hot' && (
              <div className="min-w-0 max-w-full">
                <HotOffersPage
                  offers={hotOffers}
                  cart={cart}
                  onAdd={addToCart}
                  onOpenOrders={() => selectTab('orders')}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
