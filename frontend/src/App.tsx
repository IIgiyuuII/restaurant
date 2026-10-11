import { useEffect, useState } from 'react';
import axios from 'axios';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatCard from './components/StatCard';
import StockTable from './components/StockTable';
import StopList from './components/StopList';

import type { Product, StopDish } from './types';

const API = 'http://localhost:8081/api';

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [stoplist, setStoplist] = useState<StopDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      axios.get<Product[]>(`${API}/products`),
      axios.get<StopDish[]>(`${API}/stoplist`),
    ])
      .then(([p, s]) => {
        setProducts(p.data);
        setStoplist(s.data);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const emptyProducts = products.filter((p) => p.quantity === 0).length;
  const expiringSoon = products.filter((p) => {
    if (!p.nearest_expiry) return false;
    const hours = (new Date(p.nearest_expiry).getTime() - Date.now()) / 3_600_000;
    return hours >= 0 && hours < 24;
  }).length;

  const titles: Record<string, { title: string; subtitle?: string }> = {
    dashboard: { title: 'Дашборд', subtitle: 'Обзор склада и стоп-листа' },
    stock: { title: 'Остатки', subtitle: 'Все продукты и партии' },
    stoplist: { title: 'Стоп-лист', subtitle: 'Блюда, недоступные к заказу' },
    hot: { title: 'Горячие предложения', subtitle: 'Скоро' },
    orders: { title: 'Заказы', subtitle: 'Скоро' },
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={tab} onChange={setTab} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={titles[tab].title} subtitle={titles[tab].subtitle} />

        <main className="flex-1 overflow-y-auto p-8">
          {loading && <div className="text-gray-500">Загрузка…</div>}

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 text-red-300 p-4">
              Ошибка: {error}. Проверь, что Go-сервер запущен на порту 8081.
            </div>
          )}

          {!loading && !error && tab === 'dashboard' && (
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
                  label="Истекают <24ч"
                  value={expiringSoon}
                  accent={expiringSoon > 0 ? 'yellow' : 'emerald'}
                  hint="нужно срочно использовать"
                />
                <StatCard
                  label="В стоп-листе"
                  value={stoplist.length}
                  accent={stoplist.length > 0 ? 'red' : 'emerald'}
                />
              </div>

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
                <StockTable products={products} />
              </section>
            </div>
          )}

          {!loading && !error && tab === 'stock' && <StockTable products={products} />}
          {!loading && !error && tab === 'stoplist' && <StopList dishes={stoplist} />}

          {!loading && !error && (tab === 'hot' || tab === 'orders') && (
            <div className="text-gray-500">Этот раздел ещё в разработке 🚧</div>
          )}
        </main>
      </div>
    </div>
  );
}