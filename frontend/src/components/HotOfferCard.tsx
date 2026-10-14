import { useState } from 'react';
import type { HotOffer } from '../types';
import { formatMoney, plural } from '../utils';
import ExpiryBadge from './ExpiryBadge';
import Icon from './Icons';
import type { IconName } from './Icons';

type Props = {
  offer: HotOffer;
  rank: number;
  topScore: number;
  inCart: number;
  onAdd: () => void;
  compact?: boolean;
};

const LEVELS: Record<HotOffer['level'], { label: string; icon: IconName; badge: string; bar: string }> = {
  critical: {
    label: 'Срочно',
    icon: 'flame',
    badge: 'bg-accent-soft border-accent/30 text-accent-text',
    bar: 'linear-gradient(90deg, #6366f1, #8b8ff8)',
  },
  high: {
    label: 'Скоро',
    icon: 'clock',
    badge: 'bg-yellow-950/60 border-yellow-800 text-yellow-300',
    bar: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
  },
  medium: {
    label: 'Желательно',
    icon: 'lightbulb',
    badge: 'bg-emerald-950/60 border-emerald-800 text-emerald-300',
    bar: 'linear-gradient(90deg, #10b981, #34d399)',
  },
};

export default function HotOfferCard({ offer, rank, topScore, inCart, onAdd, compact }: Props) {
  const lvl = LEVELS[offer.level];
  const pct = topScore > 0 ? Math.max(6, (offer.score / topScore) * 100) : 0;
  const reasons = compact ? offer.reasons.slice(0, 1) : offer.reasons;
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(offer.image_url) && !imgFailed;

  return (
    <div className="bg-surface flex flex-col rounded-2xl border border-gray-800 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-medium text-accent-text">
            {rank}
          </span>

          {showImage ? (
            <img
              src={offer.image_url}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-md"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-400/25 to-violet-400/10 text-accent-text">
              <Icon name="utensils" size={26} />
            </span>
          )}

          <div className="min-w-0">
            <div className="break-words text-base font-semibold text-gray-100">{offer.name}</div>
            <span
              className={
                'mt-1.5 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ' + lvl.badge
              }
            >
              <Icon name={lvl.icon} size={13} />
              {lvl.label}
            </span>
            <div className="mt-1.5 text-xs text-gray-500">
              {formatMoney(offer.price)} · доступно {offer.portions}{' '}
              {plural(offer.portions, ['порция', 'порции', 'порций'])}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] text-gray-500">приоритет</div>
          <div className="text-lg font-bold leading-tight text-gray-100">{offer.score.toFixed(2)}</div>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-800">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: lvl.bar }} />
      </div>

      <div className="mt-5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        <Icon name="lightbulb" size={14} className="text-yellow-400" />
        Почему рекомендуем
      </div>
      <ul className="mt-2 space-y-2">
        {reasons.map((r) => (
          <li key={r.batch_id} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 break-words text-gray-300">{r.text}</span>
            <ExpiryBadge expiry={r.expires_at} />
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
        <button
          onClick={onAdd}
          disabled={inCart >= offer.portions}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-500/25 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          <Icon name="plus" size={16} />В заказ
        </button>
        {inCart > 0 && <span className="text-xs font-medium text-accent-text">в заказе: {inCart}</span>}
      </div>
    </div>
  );
}
