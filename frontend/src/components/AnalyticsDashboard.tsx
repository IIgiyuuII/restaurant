import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Batch, ExpiryReport, HotOffer, OrderHistoryEntry, Product, RestockItem, StopDish } from '../types';
import StatCard from './StatCard';
import DonutChart from './DonutChart';
import RevenueChart from './RevenueChart';
import { hoursUntil } from '../utils';

type Props = {
  products: Product[];
  stoplist: StopDish[];
  batches: Batch[];
  history: OrderHistoryEntry[];
  hotOffers: HotOffer[];
  restock: RestockItem[];
  report: ExpiryReport | null;
  onNavigate: (tab: string) => void;
};

const number = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
const dayLabel = (date: Date) => date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return <section className={'min-w-0 rounded-2xl border border-gray-800 bg-surface p-4 sm:p-5 ' + className}>
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-gray-500">{subtitle}</p>}
    </div>
    {children}
  </section>;
}

function BarChart({ items, valueLabel = 'позиций', color = '#818cf8' }: { items: { label: string; value: number }[]; valueLabel?: string; color?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (!items.length) return <Empty message="Пока недостаточно данных для диаграммы." />;
  return <div className="space-y-3">
    {items.map((item) => <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-x-3 gap-y-1.5">
      <div className="truncate text-xs text-gray-300" title={item.label}>{item.label}</div>
      <div className="text-right font-mono text-xs text-gray-400">{number(item.value)}</div>
      <div className="col-span-2 h-2 overflow-hidden rounded-full bg-gray-800">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(item.value > 0 ? 2 : 0, item.value / max * 100)}%`, background: color }} />
      </div>
    </div>)}
    <p className="pt-1 text-[11px] text-gray-600">{valueLabel}</p>
  </div>;
}

function Empty({ message }: { message: string }) {
  return <div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed border-gray-800 px-4 text-center text-sm text-gray-500">{message}</div>;
}

function OrdersTrend({ history, days }: { history: OrderHistoryEntry[]; days: number }) {
  const now = new Date();
  const data = Array.from({ length: days }, (_, i) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - 1 - i));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const orders = history.filter((order) => {
      const t = new Date(order.created_at).getTime();
      return t >= date.getTime() && t < next.getTime();
    });
    return { date, label: dayLabel(date), total: orders.length, accepted: orders.filter((o) => o.status === 'created').length };
  });
  const max = Math.max(1, ...data.map((d) => d.total));
  const w = 620, h = 220, left = 26, right = 14, top = 16, bottom = 30;
  const chartW = w - left - right, chartH = h - top - bottom;
  const points = data.map((d, i) => `${left + (data.length === 1 ? chartW / 2 : i / (data.length - 1) * chartW)},${top + chartH - d.total / max * chartH}`).join(' ');
  const area = `${left},${top + chartH} ${points} ${left + chartW},${top + chartH}`;
  return <div>
    {history.length === 0 ? <Empty message="Заказы появятся здесь после первых операций." /> : <>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-400">
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-indigo-400" />Все заказы</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-emerald-400" />Успешные: {history.filter(o => o.status === 'created').length}</span>
        <span className="ml-auto text-gray-600">Загружено записей: {history.length}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-visible" role="img" aria-label={`Количество заказов за последние ${days} дней`}>
        {[0, .5, 1].map((ratio) => <g key={ratio}>
          <line x1={left} x2={w-right} y1={top + chartH * ratio} y2={top + chartH * ratio} stroke="currentColor" opacity=".12" strokeDasharray="4 5" />
          <text x={left-8} y={top + chartH * ratio + 4} textAnchor="end" fill="currentColor" opacity=".55" fontSize="10">{Math.round(max * (1-ratio))}</text>
        </g>)}
        <polygon points={area} fill="#818cf8" opacity=".12" />
        <polyline points={points} fill="none" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = left + (data.length === 1 ? chartW / 2 : i / (data.length - 1) * chartW);
          const y = top + chartH - d.total / max * chartH;
          return <g key={d.label}>
            <circle cx={x} cy={y} r="4" fill="#818cf8" stroke="#171a3a" strokeWidth="2">
              <title>{`${d.label}: ${d.total} заказов, успешно ${d.accepted}`}</title>
            </circle>
            {(days <= 7 || i % 5 === 0 || i === data.length - 1) && <text x={x} y={h-8} textAnchor="middle" fill="currentColor" opacity=".6" fontSize="10">{d.label}</text>}
          </g>;
        })}
      </svg>
      <p className="mt-1 text-[11px] text-gray-600">График строится по истории заказов, которую возвращает API (последние записи), а не по агрегированной статистике за всё время.</p>
    </>}
  </div>;
}

export default function AnalyticsDashboard({ products, stoplist, batches, history, hotOffers, restock, report, onNavigate }: Props) {
  const [days, setDays] = useState(7);
  const emptyProducts = products.filter((p) => p.quantity === 0).length;
  const expiry = useMemo(() => {
    const result = { overdue: 0, within24: 0, within72: 0, safe: 0 };
    for (const batch of batches) {
      const h = hoursUntil(batch.expires_at);
      if (h <= 0) result.overdue++;
      else if (h <= 24) result.within24++;
      else if (h <= 72) result.within72++;
      else result.safe++;
    }
    return result;
  }, [batches]);

  const topDishes = useMemo(() => {
    const totals = new Map<string, number>();
    for (const order of history) {
      if (order.status !== 'created') continue;
      for (const item of order.items ?? []) totals.set(item.name, (totals.get(item.name) ?? 0) + item.quantity);
    }
    return [...totals].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [history]);

  const lowStock = useMemo(() => restock.slice().sort((a, b) => b.suggested_quantity - a.suggested_quantity).slice(0, 6)
    .map((item) => ({ label: item.name, value: item.status === 'out' ? 0 : item.quantity / Math.max(1, item.min_stock) * 100, status: item.status })), [restock]);

  const stockSlices = [
    { label: 'С запасом', value: Math.max(0, products.length - restock.length) },
    { label: 'Мало', value: restock.filter((r) => r.status === 'low').length },
    { label: 'Нет', value: restock.filter((r) => r.status === 'out').length },
  ];

  return <div className="space-y-7">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[.18em] text-indigo-300">Операционная аналитика</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-100 sm:text-3xl">Состояние ресторана</h2>
        <p className="mt-2 max-w-2xl text-sm text-gray-400">Склад, доступность меню, заказы и потери — ключевые сигналы для ежедневных решений.</p>
      </div>
      <div className="flex items-center gap-2 self-start rounded-xl border border-gray-800 bg-surface p-1 sm:self-auto" aria-label="Период графика заказов">
        {[7, 30].map((value) => <button key={value} onClick={() => setDays(value)} className={'rounded-lg px-3 py-2 text-xs font-medium transition-colors ' + (days === value ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:bg-hover hover:text-gray-100')}>{value} дней</button>)}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4">
      <StatCard label="Продуктов в каталоге" value={products.length} hint="учётных позиций" accent="indigo" icon="box" onClick={() => onNavigate('stock')} />
      <StatCard label="Нет в наличии" value={emptyProducts} hint="позиции с нулевым остатком" accent={emptyProducts ? 'red' : 'green'} icon="ban" onClick={() => onNavigate('stock')} />
      <StatCard label="Риск срока годности" value={expiry.overdue + expiry.within24} hint={`${expiry.overdue} просрочено · ${expiry.within24} истекает за 24 ч`} accent={expiry.overdue + expiry.within24 ? 'orange' : 'green'} icon="clock" onClick={() => onNavigate('writeoffs')} />
      <StatCard label="Блюд в стоп-листе" value={stoplist.length} hint="недоступны к заказу" accent={stoplist.length ? 'yellow' : 'green'} icon="flame" onClick={() => onNavigate('stoplist')} />
    </div>

    <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <RevenueChart />
      <Panel title="Динамика заказов" subtitle={`Количество заказов по дням · выбранный период ${days} дней`} className="h-full">
        <OrdersTrend history={history} days={days} />
      </Panel>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Сроки годности партий" subtitle="Раннее предупреждение помогает использовать продукты до потерь.">
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Просрочено', value: expiry.overdue, color: '#fb7185', bg: 'bg-rose-400/10' },
            { label: 'До 24 часов', value: expiry.within24, color: '#fb923c', bg: 'bg-orange-400/10' },
            { label: '24–72 часа', value: expiry.within72, color: '#fbbf24', bg: 'bg-amber-400/10' },
            { label: 'Больше 3 дней', value: expiry.safe, color: '#34d399', bg: 'bg-emerald-400/10' },
          ].map((item) => <div key={item.label} className={`rounded-xl border border-gray-800 p-3 ${item.bg}`}>
            <div className="mb-2 text-xs text-gray-500">{item.label}</div>
            <div className="text-2xl font-semibold" style={{ color: item.color }}>{item.value}</div>
          </div>)}
        </div>
        <div className="space-y-3">
          {[
            { label: 'Просрочено', value: expiry.overdue, color: '#fb7185' },
            { label: 'Истекает за 24 ч', value: expiry.within24, color: '#fb923c' },
            { label: 'Истекает за 72 ч', value: expiry.within72, color: '#fbbf24' },
            { label: 'Запас по сроку', value: expiry.safe, color: '#34d399' },
          ].map((item) => <div key={item.label} className="grid grid-cols-[105px_minmax(0,1fr)_28px] items-center gap-3 text-xs">
            <span className="text-gray-400">{item.label}</span><div className="h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full" style={{ width: `${batches.length ? item.value / batches.length * 100 : 0}%`, background: item.color }} /></div><span className="text-right font-mono text-gray-300">{item.value}</span>
          </div>)}
        </div>
        <button onClick={() => onNavigate('writeoffs')} className="mt-5 text-xs font-medium text-indigo-300 hover:text-indigo-200">Открыть списания →</button>
      </Panel>
      <Panel title="Состояние запасов" subtitle="Доля позиций с достаточным остатком и позиций, требующих пополнения.">
        {products.length ? <DonutChart slices={stockSlices} centerValue={products.length} centerLabel="продуктов" formatValue={(v) => `${v} поз.`} /> : <Empty message="Нет данных об остатках." />}
        {restock.length > 0 && <button onClick={() => onNavigate('delivery')} className="mt-3 text-xs font-medium text-indigo-300 hover:text-indigo-200">Перейти к пополнению ({restock.length}) →</button>}
      </Panel>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Самые востребованные блюда" subtitle="Количество порций в успешных заказах из загруженной истории.">
        <BarChart items={topDishes} valueLabel="порций в истории заказов" color="#818cf8" />
      </Panel>
      <Panel title="Что нужно пополнить" subtitle="Позиции из рекомендаций склада; шкала показывает остаток относительно минимального запаса.">
        {lowStock.length ? <div className="space-y-3">
          {lowStock.map((item) => <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-x-3 gap-y-1.5">
            <div className="flex min-w-0 items-center gap-2"><span className={'h-2 w-2 shrink-0 rounded-full ' + (item.status === 'out' ? 'bg-rose-400' : 'bg-amber-400')} /><span className="truncate text-xs text-gray-300" title={item.label}>{item.label}</span></div>
            <span className="text-right text-xs text-gray-500">{item.status === 'out' ? '0%' : `${Math.round(item.value)}%`}</span>
            <div className="col-span-2 h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full" style={{ width: `${Math.min(100, item.value)}%`, background: item.status === 'out' ? '#fb7185' : '#fbbf24' }} /></div>
          </div>)}
          <button onClick={() => onNavigate('delivery')} className="pt-2 text-xs font-medium text-indigo-300 hover:text-indigo-200">Открыть рекомендации по закупке →</button>
        </div> : <Empty message="Нет критичных позиций. Запасы не требуют срочного пополнения." />}
      </Panel>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Panel title="Списание продуктов" subtitle={`Структура списаний по числу партий за последние ${report?.days ?? 30} дней.`}>
        {report && report.total_batches > 0 ? <DonutChart slices={report.by_product.map((item) => ({ label: item.name, value: item.batches }))} centerValue={report.total_batches} centerLabel="партий списано" formatValue={(v) => `${v} парт.`} /> : <Empty message="За выбранный отчётный период списаний не было." />}
        <button onClick={() => onNavigate('writeoffs')} className="mt-3 text-xs font-medium text-indigo-300 hover:text-indigo-200">Аналитика списаний →</button>
      </Panel>
      <Panel title="Операционные сигналы" subtitle="Что требует внимания прямо сейчас.">
        <div className="space-y-2">
          {[
            { label: 'Просроченные партии', value: expiry.overdue, detail: 'Требуют списания', tab: 'writeoffs', tone: 'red' },
            { label: 'Позиции без остатка', value: emptyProducts, detail: 'Проверьте поставку', tab: 'delivery', tone: 'orange' },
            { label: 'Блюда в стоп-листе', value: stoplist.length, detail: 'Недоступны гостям', tab: 'stoplist', tone: 'yellow' },
            { label: 'Рекомендации к закупке', value: restock.length, detail: 'Можно сформировать поставку', tab: 'delivery', tone: 'indigo' },
          ].map((signal) => <button key={signal.label} onClick={() => onNavigate(signal.tab)} className="flex w-full items-center gap-3 rounded-xl border border-gray-800 px-3 py-3 text-left transition-colors hover:bg-hover">
            <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ' + (signal.tone === 'red' ? 'bg-rose-400/10 text-rose-300' : signal.tone === 'orange' ? 'bg-orange-400/10 text-orange-300' : signal.tone === 'yellow' ? 'bg-amber-400/10 text-amber-300' : 'bg-indigo-400/10 text-indigo-300')}>{signal.value}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm text-gray-200">{signal.label}</span><span className="mt-0.5 block text-xs text-gray-500">{signal.detail}</span></span>
            <span className="text-gray-600">↗</span>
          </button>)}
        </div>
      </Panel>
    </div>
  </div>;
}
