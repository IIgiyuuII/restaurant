import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import axios from 'axios';

import { api, errorMessage } from '../api';
import type { Cart, Dish, OrderHistoryEntry, OrderResult } from '../types';
import { formatDate, formatMoney, plural } from '../utils';
import OrderResultCard from './OrderResultCard';
import Icon from './Icons';

type Props = {
  dishes: Dish[];
  history: OrderHistoryEntry[];
  /** Корзина живёт в App, чтобы не терялась при переключении вкладок. */
  cart: Cart;
  setCart: Dispatch<SetStateAction<Cart>>;
  /** Вызывается после любого ответа сервера — чтобы обновить остатки и стоп-лист. */
  onChanged: () => Promise<void>;
};

const MAX_PER_DISH = 100;

export default function OrdersPage({ dishes, history, cart, setCart, onChanged }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Эффективное количество: не больше доступных порций (остатки могли измениться).
  const qtyOf = (d: Dish) =>
    Math.min(cart[d.id] ?? 0, Math.max(d.portions, 0), MAX_PER_DISH);

  const lines = dishes.filter((d) => qtyOf(d) > 0);
  const total = lines.reduce((sum, d) => sum + d.price * qtyOf(d), 0);
  const totalPortions = lines.reduce((sum, d) => sum + qtyOf(d), 0);

  const change = (d: Dish, delta: number) =>
    setCart((prev) => {
      const next = Math.max(0, Math.min(qtyOf(d) + delta, d.portions, MAX_PER_DISH));
      return { ...prev, [d.id]: next };
    });

  const submit = async () => {
    if (lines.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<OrderResult>('/orders', {
        items: lines.map((d) => ({ dish_id: d.id, quantity: qtyOf(d) })),
      });
      setResult(data);
      setCart({});
    } catch (e) {
      // 409 с телом rejected — штатный отказ из-за нехватки ингредиентов.
      if (axios.isAxiosError(e) && e.response?.status === 409 && e.response.data?.status === 'rejected') {
        setResult(e.response.data as OrderResult);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setSubmitting(false);
      await onChanged();
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Меню */}
        <section>
          <h2 className="text-base font-semibold text-gray-100 mb-3">Меню</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {dishes.map((d) => {
              const qty = qtyOf(d);
              const stopped = d.portions <= 0;
              return (
                <div
                  key={d.id}
                  className={
                    'rounded-2xl border p-4 transition-colors ' +
                    (stopped
                      ? 'border-gray-800 bg-surface/50 opacity-60'
                      : qty > 0
                        ? 'border-accent/50 bg-accent-soft'
                        : 'border-gray-800 bg-surface')
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-gray-100">{d.name}</div>
                    <div className="text-gray-300 whitespace-nowrap">{formatMoney(d.price)}</div>
                  </div>

                  <div className="mt-1 text-xs">
                    {stopped ? (
                      <span className="inline-flex items-center gap-1 text-red-400"><Icon name="ban" size={13} />стоп-лист</span>
                    ) : (
                      <span className={d.portions <= 3 ? 'text-yellow-400' : 'text-gray-500'}>
                        доступно {d.portions} {plural(d.portions, ['порция', 'порции', 'порций'])}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => change(d, -1)}
                      disabled={stopped || qty === 0}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 text-gray-300 hover:border-accent hover:bg-hover hover:text-accent-text disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label={`Убрать ${d.name}`}
                    >
                      <Icon name="minus" size={16} />
                    </button>
                    <span className="w-8 text-center font-mono text-gray-100">{qty}</span>
                    <button
                      onClick={() => change(d, 1)}
                      disabled={stopped || qty >= d.portions}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 text-gray-300 hover:border-accent hover:bg-hover hover:text-accent-text disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label={`Добавить ${d.name}`}
                    >
                      <Icon name="plus" size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Корзина */}
        <aside className="rounded-2xl border border-gray-800 bg-surface p-5 xl:sticky xl:top-0">
          <h2 className="text-base font-semibold text-gray-100 mb-3">Заказ</h2>

          {lines.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">
              Добавьте блюда из меню
            </div>
          ) : (
            <ul className="space-y-2 mb-4">
              {lines.map((d) => (
                <li key={d.id} className="animate-fade-up flex items-center justify-between text-sm">
                  <span className="text-gray-200">
                    {d.name} <span className="text-gray-500">× {qtyOf(d)}</span>
                  </span>
                  <span className="text-gray-300 font-mono">{formatMoney(d.price * qtyOf(d))}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between border-t border-gray-800 pt-3 mb-4">
            <span className="text-gray-400 text-sm">
              Итого · {totalPortions} {plural(totalPortions, ['порция', 'порции', 'порций'])}
            </span>
            <span className="text-lg font-semibold text-gray-100">{formatMoney(total)}</span>
          </div>

          <button
            onClick={submit}
            disabled={lines.length === 0 || submitting}
            className="w-full rounded-lg bg-accent hover:bg-accent-hover text-white shadow-md shadow-indigo-500/25 font-medium py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Оформляем…' : 'Оформить заказ'}
          </button>
          {lines.length > 0 && (
            <button
              onClick={() => setCart({})}
              className="w-full mt-2 text-sm text-gray-500 hover:text-gray-300"
            >
              Очистить
            </button>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-800 bg-red-950/40 text-red-300 text-sm p-3">
              {error}
            </div>
          )}
        </aside>
      </div>

      {result && <OrderResultCard result={result} onClose={() => setResult(null)} />}

      {/* История */}
      <section>
        <h2 className="text-base font-semibold text-gray-100 mb-3">Последние заказы</h2>
        {history.length === 0 ? (
          <div className="text-sm text-gray-500">Заказов пока нет</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-surface">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-inset">
                  <th className="px-4 py-3 font-medium">№</th>
                  <th className="px-4 py-3 font-medium">Время</th>
                  <th className="px-4 py-3 font-medium">Состав</th>
                  <th className="px-4 py-3 font-medium text-right">Выручка</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {history.map((o) => (
                  <tr key={o.id} className="border-b border-gray-900 align-top">
                    <td className="px-4 py-3 font-mono text-gray-400">{o.number}</td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {formatDate(o.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-200">
                      {o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-gray-200">
                      {o.status === 'created' ? <>{o.revenue_estimated ? '≈ ' : ''}{formatMoney(o.revenue)}</> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {o.status === 'created' ? (
                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs bg-emerald-950/60 border border-emerald-800 text-emerald-300">
                          оформлен
                        </span>
                      ) : (
                        <div>
                          <span className="inline-flex px-2 py-0.5 rounded-md text-xs bg-red-950/60 border border-red-800 text-red-300">
                            отклонён
                          </span>
                          {o.reason && (
                            <div className="mt-1 text-xs text-gray-500">{o.reason}</div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
