import type { HotOffer } from '../types';
import { formatMoney, plural } from '../utils';
import ExpiryBadge from './ExpiryBadge';

type Props = {
  offer: HotOffer;
  rank: number;
  topScore: number;
  inCart: number;
  onAdd: () => void;
  compact?: boolean;
};

const LEVELS = {
  critical: {
    label: '🔥 Срочно',
    badge: 'bg-red-950/60 border border-red-800 text-red-300',
    border: 'border-red-900/60',
    bar: 'bg-red-500',
  },
  high: {
    label: '⏳ Скоро',
    badge: 'bg-yellow-950/60 border border-yellow-800 text-yellow-300',
    border: 'border-yellow-900/50',
    bar: 'bg-yellow-500',
  },
  medium: {
    label: '💡 Желательно',
    badge: 'bg-emerald-950/60 border border-emerald-800 text-emerald-300',
    border: 'border-gray-800',
    bar: 'bg-emerald-500',
  },
} as const;

export default function HotOfferCard({ offer, rank, topScore, inCart, onAdd, compact }: Props) {
  const lvl = LEVELS[offer.level];
  const pct = topScore > 0 ? Math.max(6, (offer.score / topScore) * 100) : 0;
  const reasons = compact ? offer.reasons.slice(0, 1) : offer.reasons;

  return (
    <div className={'rounded-xl border bg-[#0d1220] p-4 sm:p-5 ' + lvl.border}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 w-7 h-7 rounded-full bg-gray-800 text-gray-300 text-xs flex items-center justify-center font-mono">
            {rank}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-100 text-base sm:text-lg break-words">
                {offer.name}
              </span>
              <span className={'inline-flex px-2 py-0.5 rounded-md text-xs ' + lvl.badge}>
                {lvl.label}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {formatMoney(offer.price)} · доступно {offer.portions}{' '}
              {plural(offer.portions, ['порция', 'порции', 'порций'])}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs text-gray-500">приоритет</div>
          <div className="font-mono text-gray-100">{offer.score.toFixed(2)}</div>
        </div>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={'h-full ' + lvl.bar} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 text-xs uppercase tracking-wide text-gray-600">Почему рекомендуем</div>
      <ul className="mt-2 space-y-1.5">
        {reasons.map((r) => (
          <li
            key={r.batch_id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm rounded-lg bg-black/20 px-3 py-2"
          >
            <span className="text-gray-300 flex-1 min-w-0 break-words">
              {r.text}
            </span>
            <ExpiryBadge expiry={r.expires_at} />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onAdd}
          disabled={inCart >= offer.portions}
          className="w-full sm:w-auto rounded-lg bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + В заказ
        </button>
        {inCart > 0 && <span className="text-xs text-emerald-400">в заказе: {inCart}</span>}
      </div>
    </div>
  );
}