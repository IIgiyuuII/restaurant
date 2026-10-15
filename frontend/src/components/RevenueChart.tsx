import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api';
import type { RevenueDay } from '../types';
import { formatMoney } from '../utils';

const dateLabel = (value: string, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU', options).replace('.', '');
const compactMoney = (value: number) => new Intl.NumberFormat('ru-RU', {
  notation: value >= 100_000 ? 'compact' : 'standard',
  maximumFractionDigits: 1,
}).format(value);

export default function RevenueChart() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<RevenueDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<RevenueDay[]>('/analytics/revenue', { params: { days } })
      .then(({ data: response }) => {
        if (active) { setData(response); setError(null); }
      })
      .catch((e: unknown) => { if (active) setError(errorMessage(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const total = useMemo(() => data.reduce((sum, d) => sum + d.revenue, 0), [data]);
  const orders = useMemo(() => data.reduce((sum, d) => sum + d.orders, 0), [data]);
  const average = total / Math.max(1, orders);
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const chart = useMemo(() => {
    const width = 720;
    const height = 250;
    const left = 58;
    const right = 12;
    const top = 18;
    const bottom = 34;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const points = data.map((d, i) => ({
      ...d,
      x: left + (data.length <= 1 ? chartWidth / 2 : i / (data.length - 1) * chartWidth),
      y: top + chartHeight - d.revenue / max * chartHeight,
    }));
    const line = points.map((p) => `${p.x},${p.y}`).join(' ');
    const area = points.length ? `${left},${top + chartHeight} ${line} ${left + chartWidth},${top + chartHeight}` : '';
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: top + chartHeight - ratio * chartHeight,
      value: max * ratio,
    }));
    return { width, height, left, right, top, bottom, chartWidth, chartHeight, points, line, area, ticks };
  }, [data, max]);

  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-gray-800 bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.45)]" />
            Выручка
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">{formatMoney(total)}</div>
          <div className="mt-1 text-xs text-gray-500">По успешно оформленным заказам · {days} дней</div>
        </div>
        <div className="flex shrink-0 rounded-xl border border-gray-800 bg-inset p-1" aria-label="Период выручки">
          {([7, 30] as const).map((value) => (
            <button key={value} onClick={() => setDays(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${days === value ? 'bg-emerald-400/15 text-emerald-300 shadow-sm' : 'text-gray-400 hover:text-gray-100'}`}>
              {value} дней
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="mt-5 rounded-xl border border-rose-900/50 bg-rose-400/[0.06] p-4 text-sm text-rose-200">{error}</div> : loading ? (
        <div className="flex min-h-56 flex-1 items-center justify-center text-sm text-gray-500">Загрузка выручки…</div>
      ) : (
        <>
          <div className="mt-4 min-w-0 flex-1">
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-52 w-full overflow-visible sm:h-56" role="img" aria-label={`Выручка по дням за последние ${days} дней`}>
              <defs>
                <linearGradient id="revenueAreaGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity=".24" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="revenueLineGradient" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
              {chart.ticks.map((tick, i) => (
                <g key={i}>
                  <line x1={chart.left} x2={chart.width - chart.right} y1={tick.y} y2={tick.y} stroke="currentColor" opacity=".11" strokeDasharray="3 5" />
                  <text x={chart.left - 10} y={tick.y + 4} textAnchor="end" fill="currentColor" opacity=".48" fontSize="11">{compactMoney(tick.value)}</text>
                </g>
              ))}
              {chart.points.length > 1 && <polygon points={chart.area} fill="url(#revenueAreaGradient)" />}
              {chart.points.length > 1 && <polyline points={chart.line} fill="none" stroke="url(#revenueLineGradient)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
              {chart.points.map((point, i) => (
                <g key={point.date}>
                  <circle cx={point.x} cy={point.y} r={days === 7 ? 4 : 2.7} fill="#34d399" stroke="#102a24" strokeWidth="2">
                    <title>{`${dateLabel(point.date, { day: 'numeric', month: 'long' })}: ${formatMoney(point.revenue)} · заказов: ${point.orders}`}</title>
                  </circle>
                  {(days === 7 || i % 5 === 0 || i === chart.points.length - 1) && (
                    <text x={point.x} y={chart.height - 8} textAnchor="middle" fill="currentColor" opacity=".55" fontSize="11">{dateLabel(point.date)}</text>
                  )}
                </g>
              ))}
              {chart.points.length === 0 && <text x="360" y="112" textAnchor="middle" fill="currentColor" opacity=".5" fontSize="13">Нет данных за выбранный период</text>}
            </svg>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
            <div className="rounded-xl border border-gray-800/80 bg-inset/70 p-3">
              <div className="text-[11px] text-gray-500 sm:text-xs">Успешных заказов</div>
              <div className="mt-1 text-lg font-semibold text-gray-100">{orders}</div>
            </div>
            <div className="rounded-xl border border-gray-800/80 bg-inset/70 p-3">
              <div className="text-[11px] text-gray-500 sm:text-xs">Средний чек</div>
              <div className="mt-1 truncate text-lg font-semibold text-gray-100" title={formatMoney(average)}>{formatMoney(average)}</div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
