import { Fragment, useMemo, useState } from 'react';
import type { Batch, Product } from '../types';
import { formatDate, formatQuantity, formatQty, unitLabel } from '../utils';
import ExpiryBadge from './ExpiryBadge';

type Props = { products: Product[]; batches: Batch[] };

export default function StockTable({ products, batches }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  const byProduct = useMemo(() => {
    const map = new Map<string, Batch[]>();
    for (const b of batches) {
      const list = map.get(b.product_id);
      if (list) list.push(b);
      else map.set(b.product_id, [b]);
    }
    return map;
  }, [batches]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (products.length === 0) {
    return <div className="text-center text-gray-500 py-16">Нет данных</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#0d1220]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-800">
            <th className="px-4 py-3 font-medium">Продукт</th>
            <th className="px-4 py-3 font-medium text-right">Остаток</th>
            <th className="px-4 py-3 font-medium">Ед.</th>
            <th className="px-4 py-3 font-medium text-right">Партий</th>
            <th className="px-4 py-3 font-medium">Ближайший срок</th>
            <th className="px-4 py-3 font-medium">Осталось</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const list = byProduct.get(p.id) ?? [];
            const isOpen = open.has(p.id);
            const isEmpty = p.quantity === 0;
            const hasExpired = list.some((b) => b.expired);
            return (
              <Fragment key={p.id}>
                <tr
                  onClick={() => list.length > 0 && toggle(p.id)}
                  className={
                    'border-b border-gray-900 hover:bg-white/[0.02] ' +
                    (list.length > 0 ? 'cursor-pointer' : '')
                  }
                >
                  <td className="px-4 py-3 text-gray-200">
                    <span className="inline-block w-4 text-gray-500">
                      {list.length > 0 ? (isOpen ? '▾' : '▸') : ''}
                    </span>
                    {p.name}
                    {hasExpired && (
                      <span className="ml-2 text-xs text-red-400">⚠ есть просроченные</span>
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
                  <td className="px-4 py-3 text-right text-gray-400">{list.length || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(p.nearest_expiry)}</td>
                  <td className="px-4 py-3">
                    {isEmpty ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-gray-800 text-gray-400">
                        пусто
                      </span>
                    ) : (
                      <ExpiryBadge expiry={p.nearest_expiry} />
                    )}
                  </td>
                </tr>

                {isOpen && (
                  <tr className="border-b border-gray-900 bg-black/20">
                    <td colSpan={6} className="px-4 py-3">
                      <BatchList batches={list} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BatchList({ batches }: { batches: Batch[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left uppercase tracking-wide text-gray-600">
          <th className="py-1.5 pr-4 font-medium">Поставка</th>
          <th className="py-1.5 pr-4 font-medium">Получена</th>
          <th className="py-1.5 pr-4 font-medium w-56">Остаток партии</th>
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
              <td className="py-2 pr-4 font-mono text-gray-300">{b.delivery_number}</td>
              <td className="py-2 pr-4 text-gray-400">{formatDate(b.received_at)}</td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={'h-full ' + (b.expired ? 'bg-red-500' : 'bg-emerald-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-gray-300 font-mono">
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
