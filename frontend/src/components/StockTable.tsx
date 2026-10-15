import { Fragment, useMemo, useState } from 'react';
import type { Batch, Product } from '../types';
import { formatDate, formatQuantity, formatQty, unitLabel } from '../utils';
import ExpiryBadge from './ExpiryBadge';
import Icon from './Icons';
import Select from './Select';

type Props = { products: Product[]; batches: Batch[] };

const FIELD =
  'rounded-lg border border-gray-700 bg-field px-3 py-2 text-sm text-gray-100 focus:border-accent focus:outline-none';

export default function StockTable({ products, batches }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  /** '' = «Все поставки», иначе конкретный delivery_number. */
  const [deliveryFilter, setDeliveryFilter] = useState('');

  /** Список живых поставок, свежие сверху. Дубликаты убраны. */
  const deliveries = useMemo(() => {
    const set = new Set<string>();
    for (const b of batches) set.add(b.delivery_number);
    return [...set].sort().reverse();
  }, [batches]);

  /** Партии после фильтра по поставке. */
  const visibleBatches = useMemo(
    () =>
      deliveryFilter
        ? batches.filter((b) => b.delivery_number === deliveryFilter)
        : batches,
    [batches, deliveryFilter],
  );

  /** Группировка партий по продукту — для режима «все поставки». */
  const byProduct = useMemo(() => {
    const map = new Map<string, Batch[]>();
    for (const b of visibleBatches) {
      const list = map.get(b.product_id);
      if (list) list.push(b);
      else map.set(b.product_id, [b]);
    }
    return map;
  }, [visibleBatches]);

  /**
   * Продукты для показа. Когда выбрана конкретная поставка — берём только те,
   * у которых есть партии в этой поставке (иначе таблица будет забита пустыми строками).
   */
  const visibleProducts = useMemo(
    () =>
      deliveryFilter
        ? products.filter((p) => byProduct.has(p.id))
        : products,
    [products, byProduct, deliveryFilter],
  );

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allExpanded = visibleProducts.length > 0 && visibleProducts.every((p) => open.has(p.id));
  const toggleAll = () => {
    if (allExpanded) {
      setOpen(new Set());
    } else {
      setOpen(new Set(visibleProducts.map((p) => p.id)));
    }
  };

  return (
    <div className="space-y-3">
      {/* Фильтр по поставке */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs uppercase tracking-wide text-gray-500" htmlFor="delivery-filter">
          Поставка
        </label>
        <Select
          id="delivery-filter"
          value={deliveryFilter}
          onChange={(v) => {
            setDeliveryFilter(v);
            setOpen(new Set()); // сброс раскрытых строк при смене фильтра
          }}
          options={[{ value: '', label: 'Все поставки' }, ...deliveries.map((d) => ({ value: d, label: d }))]}
          className={FIELD + ' min-w-56'}
        />

        {visibleProducts.length > 0 && (
          <button
            onClick={toggleAll}
            className="text-xs text-gray-500 hover:text-accent-text"
            type="button"
          >
            {allExpanded ? 'Свернуть все' : 'Развернуть все'}
          </button>
        )}
      </div>

      {visibleProducts.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-surface py-16 text-center text-gray-500">
          {deliveryFilter ? 'В этой поставке нет живых партий' : 'Нет данных'}
        </div>
      ) : (
        <div key={deliveryFilter} className="animate-fade-up overflow-x-auto rounded-2xl border border-gray-800 bg-surface">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="bg-inset text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Продукт</th>
                <th className="px-4 py-3 text-right font-medium">Остаток</th>
                <th className="px-4 py-3 font-medium">Ед.</th>
                <th className="px-4 py-3 text-right font-medium">Партий</th>
                <th className="px-4 py-3 font-medium">Ближайший срок</th>
                <th className="px-4 py-3 font-medium">Осталось</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => {
                const list = byProduct.get(p.id) ?? [];
                const isOpen = open.has(p.id);
                const isEmpty = p.quantity === 0;
                const hasExpired = list.some((b) => b.expired);
                return (
                  <Fragment key={p.id}>
                    <tr
                      onClick={() => list.length > 0 && toggle(p.id)}
                      className={
                        'border-b border-gray-900 transition-colors hover:bg-hover ' +
                        (list.length > 0 ? 'cursor-pointer' : '')
                      }
                    >
                      <td className="px-4 py-3 text-gray-200">
                        <span className="mr-1 inline-flex w-5 align-middle text-gray-500">
                          {list.length > 0 && (
                            <Icon
                              name="chevronRight"
                              size={15}
                              className={'transition-transform duration-200 ' + (isOpen ? 'rotate-90' : '')}
                            />
                          )}
                        </span>
                        {p.name}
                        {hasExpired && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-400">
                            <Icon name="alertTriangle" size={13} />
                            есть просроченные
                          </span>
                        )}
                      </td>
                      <td
                        className={
                          'px-4 py-3 text-right font-mono ' +
                          (isEmpty ? 'text-gray-600' : 'text-gray-100')
                        }
                      >
                        {formatQuantity(p.quantity)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{unitLabel(p.unit)}</td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {list.length || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {formatDate(p.nearest_expiry)}
                      </td>
                      <td className="px-4 py-3">
                        {isEmpty ? (
                          <span className="inline-flex items-center rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                            пусто
                          </span>
                        ) : (
                          <ExpiryBadge expiry={p.nearest_expiry} />
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="border-b border-gray-900 bg-inset">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="animate-fade-up overflow-x-auto">
                            <BatchList
                              batches={list}
                              // Если выбран фильтр по поставке — колонка «Поставка»
                              // избыточна, она везде одна и та же.
                              hideDelivery={!!deliveryFilter}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BatchList({
  batches,
  hideDelivery,
}: {
  batches: Batch[];
  hideDelivery?: boolean;
}) {
  return (
    <table className="w-full min-w-[560px] text-xs">
      <thead>
        <tr className="text-left uppercase tracking-wide text-gray-600">
          {!hideDelivery && <th className="py-1.5 pr-4 font-medium">Поставка</th>}
          <th className="py-1.5 pr-4 font-medium">Получена</th>
          <th className="w-56 py-1.5 pr-4 font-medium">Остаток партии</th>
          <th className="py-1.5 pr-4 font-medium">Годна до</th>
          <th className="py-1.5 font-medium">Осталось</th>
        </tr>
      </thead>
      <tbody>
        {batches.map((b) => {
          const pct = Math.max(
            0,
            Math.min(100, (b.remaining_quantity / b.initial_quantity) * 100),
          );
          return (
            <tr
              key={b.id}
              className={'border-t border-gray-800/60 ' + (b.expired ? 'bg-red-950/20' : '')}
            >
              {!hideDelivery && (
                <td className="py-2 pr-4 font-mono text-gray-300">{b.delivery_number}</td>
              )}
              <td className="py-2 pr-4 text-gray-400">{formatDate(b.received_at)}</td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-800">
                    <div
                      className={'animate-grow-x h-full origin-left ' + (b.expired ? 'bg-red-500' : 'bg-accent')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-gray-300">
                    {formatQty(b.remaining_quantity, b.unit)}
                  </span>
                  <span className="text-gray-600">
                    из {formatQuantity(b.initial_quantity)}
                  </span>
                </div>
              </td>
              <td className="py-2 pr-4 text-gray-400">{formatDate(b.expires_at)}</td>
              <td className="py-2">
                <ExpiryBadge expiry={b.expires_at} />
                {b.expired && (
                  <span className="ml-2 text-red-400">не учитывается в остатках</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}