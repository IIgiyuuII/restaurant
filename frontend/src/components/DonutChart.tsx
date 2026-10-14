import { useMemo, useState } from 'react';

export type DonutSlice = { label: string; value: number };

type Props = {
  slices: DonutSlice[];
  /** Крупная подпись в центре, когда ничего не выбрано. */
  centerValue: string | number;
  centerLabel: string;
  /** Как показывать значение сектора в легенде и в центре при наведении. */
  formatValue?: (value: number) => string;
  /** Сколько секторов показывать; остальные сливаются в «Остальные». */
  maxSlices?: number;
};

const COLORS = ['#6366f1', '#f59e0b', '#f43f5e', '#38bdf8', '#a78bfa', '#ec4899', '#14b8a6', '#fb923c'];
const OTHER_COLOR = '#6b7280';

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 72;
const STROKE = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 2.5; // зазор между секторами, px в координатах svg

/** Кольцевая диаграмма без внешних библиотек: адаптивная, с подсветкой по наведению/тапу. */
export default function DonutChart({
  slices,
  centerValue,
  centerLabel,
  formatValue = String,
  maxSlices = 6,
}: Props) {
  const [active, setActive] = useState<number | null>(null);

  const data = useMemo(() => {
    const sorted = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= maxSlices) return sorted;
    const head = sorted.slice(0, maxSlices - 1);
    const rest = sorted.slice(maxSlices - 1);
    return [...head, { label: 'Остальные', value: rest.reduce((s, r) => s + r.value, 0) }];
  }, [slices, maxSlices]);

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;

  const colorOf = (i: number) =>
    data[i].label === 'Остальные' && data.length === maxSlices ? OTHER_COLOR : COLORS[i % COLORS.length];

  const segments = data.map((d, i) => {
    const before = data.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    return {
      i,
      length: (d.value / total) * CIRCUMFERENCE,
      offset: (before / total) * CIRCUMFERENCE,
      color: colorOf(i),
    };
  });

  const shown = active !== null ? data[active] : null;
  const gap = data.length > 1 ? GAP : 0;

  return (
    // @container: раскладка зависит от ширины карточки, а не экрана — в узкой колонке легенда уходит под диаграмму.
    <div className="@container">
      <div className="flex flex-col items-center gap-6 @md:flex-row">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-48 w-48 shrink-0 @md:h-56 @md:w-56"
          role="img"
          aria-label={`${centerLabel}: ${centerValue}`}
          onMouseLeave={() => setActive(null)}
        >
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-gray-800" />
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            {segments.map((s) => (
              <circle
                key={s.i}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={active === s.i ? STROKE + 6 : STROKE}
                strokeDasharray={`${Math.max(s.length - gap, 0.5)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-s.offset}
                opacity={active === null || active === s.i ? 1 : 0.35}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setActive(s.i)}
                onClick={() => setActive(active === s.i ? null : s.i)}
              />
            ))}
          </g>
          <text
            x={CENTER}
            y={shown ? CENTER - 2 : CENTER + 2}
            textAnchor="middle"
            className="fill-gray-100"
            style={{ fontSize: shown ? 20 : 30, fontWeight: 600 }}
          >
            {shown ? formatValue(shown.value) : centerValue}
          </text>
          <text
            x={CENTER}
            y={CENTER + 18}
            textAnchor="middle"
            className="fill-gray-500"
            style={{ fontSize: 11 }}
          >
            {shown
              ? `${shown.label.length > 16 ? shown.label.slice(0, 15) + '…' : shown.label} · ${Math.round((shown.value / total) * 100)}%`
              : centerLabel}
          </text>
        </svg>

        <ul className="w-full min-w-0 flex-1 space-y-1">
          {data.map((d, i) => (
            <li
              key={d.label}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
              className={
                'flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors ' +
                (active === i ? 'bg-hover' : 'hover:bg-hover')
              }
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(i) }} />
              <span className="min-w-0 flex-1 truncate text-gray-200">{d.label}</span>
              <span className="shrink-0 font-mono text-gray-400">{formatValue(d.value)}</span>
              <span className="w-10 shrink-0 text-right text-xs text-gray-500">
                {Math.round((d.value / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
