import Icon from './Icons';
import type { IconName } from './Icons';

export type StatAccent = 'neutral' | 'slate' | 'indigo' | 'orange' | 'green' | 'red' | 'yellow';

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: StatAccent;
  icon?: IconName;
  /** Если задан — карточка кликабельна и показывает стрелку. */
  onClick?: () => void;
};

// card — фон и рамка карточки, chip — плитка с иконкой.
const ACCENTS: Record<StatAccent, { card: string; chip: string }> = {
  neutral: { card: 'bg-surface border-gray-800', chip: 'bg-accent-soft text-accent-text' },
  slate: { card: 'bg-slate-400/15 border-slate-400/25', chip: 'bg-slate-400/25 text-gray-200' },
  indigo: { card: 'bg-indigo-400/15 border-indigo-400/30', chip: 'bg-indigo-500/25 text-accent-text' },
  orange: { card: 'bg-orange-400/15 border-orange-400/35', chip: 'bg-orange-400/25 text-orange-500' },
  green: { card: 'bg-emerald-400/10 border-emerald-500/25', chip: 'bg-emerald-400/20 text-emerald-400' },
  red: { card: 'bg-red-400/10 border-red-500/25', chip: 'bg-red-400/20 text-red-400' },
  yellow: { card: 'bg-yellow-400/10 border-yellow-500/25', chip: 'bg-yellow-400/20 text-yellow-400' },
};

export default function StatCard({ label, value, hint, accent = 'neutral', icon, onClick }: Props) {
  const a = ACCENTS[accent];
  const cls =
    'relative flex h-full w-full flex-col rounded-2xl border p-4 text-left backdrop-blur-md sm:p-5 ' +
    a.card +
    (onClick ? ' cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg' : '');

  const body = (
    <>
      <div className="flex w-full items-start justify-between">
        {icon ? (
          <span className={'flex h-10 w-10 items-center justify-center rounded-xl ' + a.chip}>
            <Icon name={icon} size={20} />
          </span>
        ) : (
          <span />
        )}
        {onClick && <Icon name="arrowRight" size={16} className="text-gray-500" />}
      </div>
      <div className="mt-5 text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1.5 text-3xl font-bold leading-tight break-words text-gray-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </>
  );

  return onClick ? (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
