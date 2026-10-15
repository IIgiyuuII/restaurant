
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
const PAGE_SIZE = 10;

export default function OrdersPage({
  dishes,
  history,
  cart,
  setCart,
  onChanged,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Пагинация истории заказов.
  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pageHistory = history.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // Эффективное количество: не больше доступных порций.
  const qtyOf = (d: Dish) =>
    Math.min(
      cart[d.id] ?? 0,
      Math.max(d.portions, 0),
      MAX_PER_DISH,
    );

  const lines = dishes.filter((d) => qtyOf(d) > 0);
  const total = lines.reduce((sum, d) => sum + d.price * qtyOf(d), 0);
  const totalPortions = lines.reduce((sum, d) => sum + qtyOf(d), 0);

  const change = (d: Dish, delta: number) =>
    setCart((prev) => {
      const next = Math.max(
        0,
        Math.min(
          (prev[d.id] ?? 0) + delta,
          Math.max(d.portions, 0),
          MAX_PER_DISH,
        ),
      );

      return { ...prev, [d.id]: next };
    });

  const submit = async () => {
    if (lines.length === 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const { data } = await api.post<OrderResult>('/orders', {
        items: lines.map((d) => ({
          dish_id: d.id,
          quantity: qtyOf(d),
        })),
      });

      setResult(data);
      setCart({});
    } catch (e) {
      // 409 с телом rejected — штатный отказ из-за нехватки ингредиентов.
      if (
        axios.isAxiosError(e) &&
        e.response?.status === 409 &&
        e.response.data?.status === 'rejected'
      ) {
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
      {/* Каталог и корзина */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 xl:gap-5 items-start">
        {/* Левая колонка — меню */}
        <section className="min-w-0">
          <h2 className="text-base font-semibold text-gray-100 mb-3">
            Меню
          </h2>

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
                    <div className="font-medium text-gray-100">
                      {d.name}
                    </div>

                    <div className="text-gray-300 whitespace-nowrap">
                      {formatMoney(d.price)}
                    </div>
                  </div>

                  <div className="mt-1 text-xs">
                    {stopped ? (
                      <span className="inline-flex items-center gap-1 text-red-400">
                        <Icon name="ban" size={13} />
                        В стоп-листе
                      </span>
                    ) : (
                      <span
                        className={
                          d.portions <= 3
                            ? 'text-yellow-400'
                            : 'text-gray-500'
                        }
                      >
                        доступно {d.portions}{' '}
                        {plural(d.portions, [
                          'порция',
                          'порции',
                          'порций',
                        ])}
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

                    <span className="w-8 text-center font-mono text-gray-100">
                      {qty}
                    </span>

                    <button
                      onClick={() => change(d, 1)}
                      disabled={
                        stopped ||
                        qty >= d.portions ||
                        qty >= MAX_PER_DISH
                      }
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

        {/* Правая колонка — заказ.
            На больших экранах верх окна совпадает с верхом карточек меню. */}
        <aside className="min-w-0 mt-0 xl:mt-[35px] self-start rounded-2xl border border-gray-800 bg-surface p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-100">
                Заказ
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Состав заказа
              </p>
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-800 bg-inset">
              
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-400">
                Корзина пуста
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Добавьте блюда из меню
              </p>
            </div>
          ) : (
            <ul className="mb-4 max-h-[min(40vh,360px)] space-y-3 overflow-y-auto">
              {lines.map((d) => (
                <li
                  key={d.id}
                  className="animate-fade-up flex items-start justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="break-words text-gray-200">
                      {d.name}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatMoney(d.price)} × {qtyOf(d)}
                    </p>
                  </div>

                  <span className="shrink-0 whitespace-nowrap font-mono text-gray-300">
                    {formatMoney(d.price * qtyOf(d))}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-gray-800 pt-3 mb-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-400">
                Итого
              </span>

              <span className="text-lg font-semibold text-gray-100">
                {formatMoney(total)}
              </span>
            </div>

            <p className="mt-1 text-right text-xs text-gray-500">
              {totalPortions}{' '}
              {plural(totalPortions, [
                'порция',
                'порции',
                'порций',
              ])}
            </p>
          </div>

          <button
            onClick={submit}
            disabled={lines.length === 0 || submitting}
            className="w-full rounded-xl bg-accent px-4 py-2.5 font-medium text-white shadow-md shadow-indigo-500/20 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Оформляем…' : 'Оформить заказ'}
          </button>

          {lines.length > 0 && (
            <button
              onClick={() => setCart({})}
              disabled={submitting}
              className="w-full mt-2 rounded-lg py-2 text-sm text-gray-500 transition-colors hover:bg-hover hover:text-gray-300 disabled:opacity-40"
            >
              Очистить
            </button>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </aside>
      </div>

      {/* Результат оформления */}
      {result && (
        <OrderResultCard
          result={result}
          onClose={() => setResult(null)}
        />
      )}

      {/* История заказов с пагинацией */}
      <section>
        <h2 className="text-base font-semibold text-gray-100 mb-3">
          Последние заказы
        </h2>

        {history.length === 0 ? (
          <div className="text-sm text-gray-500">
            Заказов пока нет
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-surface">
            <table className="w-full min-w-[700px] table-fixed text-sm">
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[19%]" />
                <col className="w-[39%]" />
                <col className="w-[17%]" />
                <col className="w-[17%]" />
              </colgroup>
                <thead>
                  <tr className="bg-inset text-left text-xs text-gray-500">
                    <th className="px-4 py-3 font-medium">№</th>
                    <th className="px-4 py-3 font-medium">Время</th>
                    <th className="px-4 py-3 font-medium">Состав</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Выручка
                    </th>
                    <th className="px-4 py-3 font-medium">Статус</th>
                  </tr>
                </thead>

                <tbody>
                  {pageHistory.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b border-gray-900 align-top"
                    >
                      <td className="px-4 py-3 font-mono text-gray-400">
                        {o.number}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-gray-400">
                        {formatDate(o.created_at)}
                      </td>

                      <td className="px-4 py-3 text-gray-200 break-words whitespace-normal">
                        {o.items
                          .map((i) => `${i.name} × ${i.quantity}`)
                          .join(', ')}
                      </td>

                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-gray-200">
                        {o.status === 'created' ? (
                          <>
                            {o.revenue_estimated ? '≈ ' : ''}
                            {formatMoney(o.revenue)}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {o.status === 'created' ? (
                          <span className="inline-flex rounded-md border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-300">
                            оформлен
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex rounded-md border border-red-800 bg-red-950/60 px-2 py-0.5 text-xs text-red-300">
                              отклонён
                            </span>

                            {o.reason && (
                              <div className="mt-1 text-xs text-gray-500">
                                {o.reason}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Управление страницами */}
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                Показано {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, history.length)} из{' '}
                {history.length} заказов
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Назад
                </button>

                <span className="min-w-20 text-center text-sm text-gray-400">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Далее →
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
