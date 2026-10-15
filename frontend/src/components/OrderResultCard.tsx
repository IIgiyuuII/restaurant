import type { OrderResult } from '../types';
import { formatDate, formatQty } from '../utils';
import ExpiryBadge from './ExpiryBadge';
import Icon from './Icons';

type Props = { result: OrderResult; onClose: () => void };

export default function OrderResultCard({ result, onClose }: Props) {
  const ok = result.status === 'created';

  return (
    <div
      className={
        'animate-pop-in rounded-2xl border p-5 ' +
        (ok
          ? 'border-emerald-800/50 bg-emerald-950/20'
          : 'border-red-900/60 bg-red-950/20')
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={'flex items-center gap-2 font-semibold ' + (ok ? 'text-emerald-300' : 'text-red-300')}>
            <Icon name={ok ? 'checkCircle' : 'xCircle'} size={20} />
            {ok ? `Заказ №${result.number} оформлен` : `Заказ №${result.number} отклонён`}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {result.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-500 hover:bg-hover hover:text-gray-200"
          aria-label="Закрыть"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {ok && result.write_offs && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            Списано со склада (сначала партии с ближайшим сроком)
          </div>
          <ul className="space-y-1.5">
            {result.write_offs.map((w) => (
              <li
                key={w.batch_id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm rounded-lg bg-inset px-3 py-2"
              >
                <span className="text-gray-200 min-w-32">{w.product}</span>
                <span className="font-mono text-emerald-300">
                  −{formatQty(w.quantity, w.unit)}
                </span>
                <span className="text-gray-500">
                  партия до {formatDate(w.expires_at)}
                </span>
                <ExpiryBadge expiry={w.expires_at} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!ok && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            Не хватает ингредиентов
          </div>
          <ul className="space-y-1.5">
            {(result.shortages ?? []).map((s) => (
              <li
                key={s.product_id}
                className="flex flex-wrap items-center gap-x-3 text-sm rounded-lg bg-inset px-3 py-2"
              >
                <span className="text-gray-200 min-w-32">{s.product}</span>
                <span className="text-gray-400">
                  нужно {formatQty(s.needed, s.unit)}, есть {formatQty(s.available, s.unit)}
                </span>
                <span className="font-mono text-red-300">
                  не хватает {formatQty(s.needed - s.available, s.unit)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
