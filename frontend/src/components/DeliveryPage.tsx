import { useEffect, useRef, useState } from 'react';

import { api, errorMessage } from '../api';
import type { DeliveryResult, Product, RestockItem } from '../types';
import { formatDate, formatQty, plural, unitLabel } from '../utils';
import ExpiryBadge from './ExpiryBadge';

type Props = {
  products: Product[];
  restock: RestockItem[];
  /** Вызывается после ответа сервера — чтобы обновить остатки, стоп-лист и рекомендации. */
  onChanged: () => Promise<void>;
};

type Row = {
  key: number;
  productId: string;
  qty: string;
  shelf: string;
  shelfUnit: 'h' | 'd';
};

const FIELD =
  'rounded-lg border border-gray-700 bg-[#0b0f19] px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-emerald-500 focus:outline-none';
const INPUT = FIELD + ' w-full';
const LABEL_TEXT = 'text-xs uppercase tracking-wide text-gray-500';
const LABEL = 'mb-1 block ' + LABEL_TEXT;

// Ключи строк формы: счётчик живёт вне компонента, чтобы не читать ref во время рендера.
let nextRowKey = 1;
const newRow = (): Row => ({ key: nextRowKey++, productId: '', qty: '', shelf: '', shelfUnit: 'd' });

export default function DeliveryPage({ products, restock, onChanged }: Props) {
  const [number, setNumber] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryResult | null>(null);

  const formRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit ?? '';

  const patchRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  /** Кладёт рекомендацию в форму: в пустую строку или в новую. Дубликаты не создаём. */
  const withSuggestion = (list: Row[], item: RestockItem): Row[] => {
    if (list.some((r) => r.productId === item.product_id)) return list;
    const fill = {
      productId: item.product_id,
      qty: item.suggested_quantity > 0 ? String(item.suggested_quantity) : '',
    };
    const empty = list.findIndex((r) => !r.productId && !r.qty && !r.shelf);
    if (empty >= 0) return list.map((r, i) => (i === empty ? { ...r, ...fill } : r));
    return [...list, { ...newRow(), ...fill }];
  };

  const addSuggestion = (item: RestockItem) => setRows((prev) => withSuggestion(prev, item));
  const addAllSuggestions = () => {
    setRows((prev) => restock.reduce(withSuggestion, prev));
    // На узком экране форма ниже рекомендаций — прокручиваем к ней.
    if (window.innerWidth < 1280) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const inForm = (id: string) => rows.some((r) => r.productId === id);

  const submit = async () => {
    if (submitting) return;
    const items: { product_id: string; quantity: number; shelf_life_hours: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const qty = Number(r.qty);
      const shelf = Number(r.shelf);
      const n = i + 1;
      if (!r.productId) return setError(`Позиция ${n}: выберите продукт`);
      if (!(qty > 0)) return setError(`Позиция ${n}: укажите количество больше 0`);
      if (!(shelf > 0)) return setError(`Позиция ${n}: укажите срок хранения больше 0`);
      items.push({
        product_id: r.productId,
        quantity: qty,
        shelf_life_hours: r.shelfUnit === 'd' ? shelf * 24 : shelf,
      });
    }

    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<DeliveryResult>('/deliveries', {
        number: number.trim() || undefined,
        items,
      });
      setResult(data);
      setNumber('');
      setRows([newRow()]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
      await onChanged();
    }
  };

  const out = restock.filter((r) => r.status === 'out');
  const low = restock.filter((r) => r.status === 'low');

  return (
    <div className="space-y-6">
      {result && (
        <div
          ref={resultRef}
          className="scroll-mt-4 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-semibold text-emerald-300">✅ Поставка принята</div>
              <div className="mt-1 break-all font-mono text-sm text-gray-400">{result.number}</div>
            </div>
            <button
              onClick={() => setResult(null)}
              className="text-lg leading-none text-gray-500 hover:text-gray-200"
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <ul className="mt-4 space-y-2">
            {result.batches.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-800 bg-[#0d1220] px-3 py-2 text-sm"
              >
                <span className="min-w-32 text-gray-200">{b.product}</span>
                <span className="font-mono text-gray-300">{formatQty(b.quantity, b.unit)}</span>
                <span className="text-gray-500">годна до {formatDate(b.expires_at)}</span>
                <ExpiryBadge expiry={b.expires_at} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_380px]">
        {/* Форма поставки */}
        <section
          ref={formRef}
          className="order-2 scroll-mt-4 rounded-xl border border-gray-800 bg-[#0d1220] p-4 sm:p-5 xl:order-1"
        >
          <h2 className="mb-4 text-sm uppercase tracking-wide text-gray-500">Новая поставка</h2>

          <div className="mb-5 max-w-sm">
            <label className={LABEL} htmlFor="delivery-number">
              Номер поставки
            </label>
            <input
              id="delivery-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Необязательно — сформируется сам"
              maxLength={64}
              className={INPUT}
            />
          </div>

          <div className="space-y-3">
            {rows.map((r, idx) => (
              <div
                key={r.key}
                className="grid grid-cols-1 gap-3 rounded-lg border border-gray-800 bg-black/20 p-3 sm:grid-cols-2"
              >
                <div className="sm:col-span-2">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className={LABEL_TEXT} htmlFor={`product-${r.key}`}>
                      Продукт{rows.length > 1 && <span className="text-gray-600"> · позиция {idx + 1}</span>}
                    </label>
                    {rows.length > 1 && (
                      <button
                        onClick={() => removeRow(r.key)}
                        className="text-xs text-gray-500 hover:text-red-300"
                        aria-label={`Удалить позицию ${idx + 1}`}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                  <select
                    id={`product-${r.key}`}
                    value={r.productId}
                    onChange={(e) => patchRow(r.key, { productId: e.target.value })}
                    className={INPUT}
                  >
                    <option value="">Выберите продукт…</option>
                    {sortedProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({unitLabel(p.unit)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={LABEL} htmlFor={`qty-${r.key}`}>
                    Количество
                  </label>
                  <div className="relative">
                    <input
                      id={`qty-${r.key}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={r.qty}
                      onChange={(e) => patchRow(r.key, { qty: e.target.value })}
                      placeholder="0"
                      className={INPUT + ' pr-10'}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-500">
                      {unitLabel(unitOf(r.productId))}
                    </span>
                  </div>
                </div>

                <div>
                  <label className={LABEL} htmlFor={`shelf-${r.key}`}>
                    Срок хранения
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`shelf-${r.key}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={r.shelf}
                      onChange={(e) => patchRow(r.key, { shelf: e.target.value })}
                      placeholder="0"
                      className={INPUT + ' min-w-0'}
                    />
                    <select
                      value={r.shelfUnit}
                      onChange={(e) => patchRow(r.key, { shelfUnit: e.target.value as 'h' | 'd' })}
                      className={FIELD + ' w-20 shrink-0'}
                      aria-label="Единица срока хранения"
                    >
                      <option value="d">сут</option>
                      <option value="h">ч</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setRows((prev) => [...prev, newRow()])}
            className="mt-3 w-full rounded-lg border border-dashed border-gray-700 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-200"
          >
            + Добавить позицию
          </button>

          <p className="mt-4 text-xs text-gray-500">
            Срок годности партии = дата поставки + срок хранения. Один продукт можно принять несколькими
            позициями с разными сроками — это будут разные партии.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className="mt-4 w-full rounded-lg bg-emerald-500 py-2.5 font-medium text-gray-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-8"
          >
            {submitting ? 'Принимаем…' : 'Принять поставку'}
          </button>
        </section>

        {/* Что нужно заказать */}
        <aside className="order-1 rounded-xl border border-gray-800 bg-[#0d1220] p-4 sm:p-5 xl:order-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-sm uppercase tracking-wide text-gray-500">Что нужно заказать</h2>
            {restock.length > 0 && <span className="text-xs text-gray-500">{restock.length}</span>}
          </div>
          <p className="mb-4 text-xs text-gray-600">
            Остатки без просроченных партий. Рекомендация — пополнить до двух минимальных норм.
          </p>

          {restock.length === 0 ? (
            <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-4 text-sm text-emerald-300">
              Запасов хватает по всем продуктам 🎉
            </div>
          ) : (
            <>
              <RestockGroup
                title="Отсутствуют"
                tone="red"
                items={out}
                inForm={inForm}
                onAdd={addSuggestion}
              />
              <RestockGroup
                title="Заканчиваются"
                tone="yellow"
                items={low}
                inForm={inForm}
                onAdd={addSuggestion}
              />
              <button
                onClick={addAllSuggestions}
                className="mt-4 w-full rounded-lg border border-emerald-700/60 bg-emerald-950/20 py-2 text-sm text-emerald-300 hover:bg-emerald-950/40"
              >
                Добавить все в поставку
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function RestockGroup({
  title,
  tone,
  items,
  inForm,
  onAdd,
}: {
  title: string;
  tone: 'red' | 'yellow';
  items: RestockItem[];
  inForm: (id: string) => boolean;
  onAdd: (item: RestockItem) => void;
}) {
  if (items.length === 0) return null;
  const dot = tone === 'red' ? 'bg-red-500' : 'bg-yellow-400';
  const head = tone === 'red' ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="mt-3 first:mt-0">
      <div className={'mb-2 flex items-center gap-2 text-xs uppercase tracking-wide ' + head}>
        <span className={'h-2 w-2 rounded-full ' + dot} />
        {title} · {items.length}
      </div>
      <ul className="space-y-2">
        {items.map((it) => {
          const added = inForm(it.product_id);
          return (
            <li key={it.product_id} className="rounded-lg border border-gray-800 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-100">{it.name}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {it.status === 'out' ? 'нет в наличии' : `осталось ${formatQty(it.quantity, it.unit)}`}
                    {' · '}минимум {formatQty(it.min_stock, it.unit)}
                  </div>
                  {it.blocked_dishes > 0 && (
                    <div className="mt-1 text-xs text-red-400">
                      🚫 из-за него не готовятся {it.blocked_dishes}{' '}
                      {plural(it.blocked_dishes, ['блюдо', 'блюда', 'блюд'])}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onAdd(it)}
                  disabled={added}
                  className="shrink-0 rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:bg-white/5 disabled:cursor-default disabled:border-emerald-800 disabled:text-emerald-400 disabled:hover:bg-transparent"
                >
                  {added ? '✓ в поставке' : '+ в поставку'}
                </button>
              </div>
              {it.suggested_quantity > 0 && (
                <div className="mt-2 text-xs text-gray-400">
                  Заказать ≈ <span className="font-mono text-gray-200">{formatQty(it.suggested_quantity, it.unit)}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
