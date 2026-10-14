import { useState } from 'react';

import { api, errorMessage } from '../api';
import type { Batch, ExpiryReport, ExpiryWriteOffResult } from '../types';
import { formatDate, formatQty, hoursUntil, plural } from '../utils';
import DonutChart from './DonutChart';
import StatCard from './StatCard';

type Props = {
  batches: Batch[];
  report: ExpiryReport | null;
  /** Вызывается после ответа сервера — чтобы обновить остатки и аналитику. */
  onChanged: () => Promise<void>;
};

const BATCH_FORMS: [string, string, string] = ['партия', 'партии', 'партий'];

function overdueLabel(expiresAt: string): string {
  const h = -hoursUntil(expiresAt);
  if (h < 1) return `${Math.max(1, Math.floor(h * 60))} мин назад`;
  if (h < 48) return `${Math.floor(h)} ч назад`;
  return `${Math.floor(h / 24)} дн. назад`;
}

function intervalLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} ч` : `${minutes} мин`;
}

export default function WriteoffsPage({ batches, report, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = batches.filter((b) => b.expired);

  const writeOff = async (ids?: string[]) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const { data } = await api.post<ExpiryWriteOffResult>('/writeoffs', ids ? { batch_ids: ids } : {});
      setFlash(
        data.written_off > 0
          ? `Списано: ${data.written_off} ${plural(data.written_off, BATCH_FORMS)}`
          : 'Списывать нечего — партии уже списаны',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      await onChanged();
    }
  };

  const top = report?.by_product[0];

  return (
    <div className="space-y-8">
      {report && (
        <div className="rounded-2xl border border-gray-800 bg-surface px-4 py-3 text-sm text-gray-400">
          {report.auto_check_minutes > 0 ? (
            <>
              ⏱ Сервер сам списывает просрочку раз в{' '}
              <span className="text-gray-200">{intervalLabel(report.auto_check_minutes)}</span>. Здесь это можно
              сделать сразу.
            </>
          ) : (
            <>⏱ Автосписание выключено — просроченные партии списываются только вручную.</>
          )}
        </div>
      )}

      {/* К списанию */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-100">К списанию</h2>
          {pending.length > 1 && (
            <button
              onClick={() => writeOff()}
              disabled={busy}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Списываем…' : `Списать всё (${pending.length})`}
            </button>
          )}
        </div>

        {flash && (
          <div className="mb-3 rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">
            ✅ {flash}
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {pending.length === 0 ? (
          <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 p-5 text-emerald-300">
            Просроченных партий нет 🎉
          </div>
        ) : (
          <ul className="divide-y divide-gray-900 rounded-2xl border border-red-900/40 bg-red-950/10">
            {pending.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="text-gray-100">{b.product}</span>
                    <span className="font-mono text-sm text-gray-300">
                      {formatQty(b.remaining_quantity, b.unit)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    <span className="font-mono">{b.delivery_number}</span>
                    {' · срок вышел '}
                    <span className="text-red-300">{formatDate(b.expires_at)}</span>
                    {' · '}
                    {overdueLabel(b.expires_at)}
                  </div>
                </div>
                <button
                  onClick={() => writeOff([b.id])}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Списать
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Аналитика */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-100">
          Аналитика списаний{report ? ` · за ${report.days} дн.` : ''}
        </h2>

        {!report ? (
          <div className="text-gray-500">Загрузка…</div>
        ) : report.total_batches === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-surface p-6 text-gray-400">
            За {report.days} дн. списаний не было — данные появятся после первого списания.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard label="Списано партий" value={report.total_batches} accent="red" icon="trash" />
              <StatCard label="Продуктов затронуто" value={report.by_product.length} accent="yellow" icon="box" />
              {top && (
                <div className="col-span-2 sm:col-span-1">
                  <StatCard
                    label="Больше всего теряем"
                    value={top.name}
                    hint={`${top.batches} ${plural(top.batches, BATCH_FORMS)} · ${formatQty(top.quantity, top.unit)}`}
                    accent="neutral" icon="flame"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-gray-800 bg-surface p-4 sm:p-5">
                <div className="mb-4 text-xs uppercase tracking-wide text-gray-500">
                  Доля продуктов в списаниях (по числу партий)
                </div>
                <DonutChart
                  slices={report.by_product.map((s) => ({ label: s.name, value: s.batches }))}
                  centerValue={report.total_batches}
                  centerLabel={plural(report.total_batches, BATCH_FORMS)}
                  formatValue={(v) => `${v} ${plural(v, BATCH_FORMS)}`}
                />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-surface">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 bg-inset">
                      <th className="px-4 py-3 font-medium">Продукт</th>
                      <th className="px-4 py-3 text-right font-medium">Партий</th>
                      <th className="px-4 py-3 text-right font-medium">Списано</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.by_product.map((s) => (
                      <tr key={s.product_id} className="border-b border-gray-900 last:border-0">
                        <td className="px-4 py-3 text-gray-200">{s.name}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{s.batches}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-100">
                          {formatQty(s.quantity, s.unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* История */}
      {report && report.recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-100">Последние списания</h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-inset">
                  <th className="px-4 py-3 font-medium">Списано</th>
                  <th className="px-4 py-3 font-medium">Продукт</th>
                  <th className="px-4 py-3 text-right font-medium">Количество</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Поставка</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Срок вышел</th>
                </tr>
              </thead>
              <tbody>
                {report.recent.map((r) => (
                  <tr key={r.id} className="border-b border-gray-900 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-400">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3 text-gray-200">{r.product}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-100">
                      {formatQty(r.quantity, r.unit)}
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-gray-400 sm:table-cell">{r.delivery_number}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-400 sm:table-cell">{formatDate(r.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
