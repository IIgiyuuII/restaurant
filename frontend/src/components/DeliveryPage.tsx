import { useEffect, useMemo, useRef, useState } from 'react';

import { api, errorMessage } from '../api';
import type { DeliveryResult, Product, RestockItem } from '../types';
import { formatDate, formatQty, plural, unitLabel } from '../utils';
import ConfirmDialog from './ConfirmDialog';
import ExpiryBadge from './ExpiryBadge';
import Icon from './Icons';
import Select from './Select';

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
  'rounded-lg border border-gray-700 bg-field px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-accent focus:outline-none';
const INPUT = FIELD + ' w-full';
const LABEL_TEXT = 'text-xs uppercase tracking-wide text-gray-500';
const LABEL = 'mb-1 block ' + LABEL_TEXT;

// ---- Бизнес-лимиты ----
/** Максимум количества по единице измерения продукта. */
const MAX_QTY: Record<string, number> = {
  g: 100_000, // 100 кг
  ml: 100_000, // 100 л
  pcs: 1_000, // 1000 штук
};
const DEFAULT_MAX_QTY = 100_000;
const maxQtyFor = (unit: string): number => MAX_QTY[unit] ?? DEFAULT_MAX_QTY;

/** Максимум срока хранения — 1 год. */
const MAX_SHELF_HOURS = 24 * 365;
const MAX_SHELF_DAYS = 365;

/** true, если у числа не больше 3 знаков после запятой (хвостовые нули не считаются). */
const hasAtMostThreeDecimals = (raw: string): boolean => {
  const dot = raw.indexOf('.');
  if (dot < 0) return true;
  const frac = raw.slice(dot + 1).replace(/0+$/, '');
  return frac.length <= 3;
};

/** Отбрасывает всё, что не цифры и не одна точка. */
const sanitizeNumeric = (raw: string): string => {
  let s = raw.replace(/[^\d.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }
  return s;
};

// ---- Валидация одной строки ----
type RowErrors = { qty?: string; shelf?: string };

function validateRow(row: Row, unit: string): RowErrors {
  const errors: RowErrors = {};
  const qty = Number(row.qty);
  const shelf = Number(row.shelf);

  if (!row.productId) {
    return { qty: 'Выберите продукт' };
  }

  if (row.qty === '' || !(qty > 0)) {
    errors.qty = 'Укажите количество больше 0';
  } else if (qty > maxQtyFor(unit)) {
    errors.qty = `Максимум ${maxQtyFor(unit).toLocaleString('ru-RU')} ${unitLabel(unit)}`;
  } else if (unit === 'pcs' && !Number.isInteger(qty)) {
    errors.qty = 'Количество штук должно быть целым числом';
  } else if ((unit === 'g' || unit === 'ml') && !hasAtMostThreeDecimals(row.qty)) {
    errors.qty = 'Не больше трёх знаков после запятой';
  }

  if (row.shelf === '' || !(shelf > 0)) {
    errors.shelf = 'Укажите срок хранения больше 0';
  } else if (!Number.isInteger(shelf)) {
    errors.shelf = 'Срок хранения должен быть целым числом';
  } else {
    const shelfMax = row.shelfUnit === 'd' ? MAX_SHELF_DAYS : MAX_SHELF_HOURS;
    if (shelf > shelfMax) {
      errors.shelf = `Максимум ${shelfMax} ${row.shelfUnit === 'd' ? 'суток' : 'часов'}`;
    }
  }

  return errors;
}

let nextRowKey = 1;
const newRow = (): Row => ({ key: nextRowKey++, productId: '', qty: '', shelf: '', shelfUnit: 'd' });

export default function DeliveryPage({ products, restock, onChanged }: Props) {
  const [number, setNumber] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryResult | null>(null);
  /** Ошибки появляются только после первой попытки submit — как в GOV.UK / Oxide. */
  const [submitted, setSubmitted] = useState(false);
  // Строки, которые прямо сейчас плавно схлопываются перед удалением.
  const [leaving, setLeaving] = useState<number[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const formRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit ?? '';

  const patchRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => {
    if (rows.length <= 1 || leaving.includes(key)) return;
    setLeaving((prev) => [...prev, key]);
    // Ждём конца анимации схлопывания (0.28 с), затем убираем строку.
    setTimeout(() => {
      setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
      setLeaving((prev) => prev.filter((k) => k !== key));
    }, 280);
  };

  const rowErrors = useMemo(
    () => rows.map((r) => validateRow(r, unitOf(r.productId))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, products],
  );

  const visibleErrors = submitted ? rowErrors : rows.map(() => ({} as RowErrors));
  const hasErrors = submitted && rowErrors.some((e) => e.qty || e.shelf);

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
    if (window.innerWidth < 1280) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const inForm = (id: string) => rows.some((r) => r.productId === id);

  const submit = async () => {
    if (submitting) return;
    setSubmitted(true);

    const errors = rows.map((r) => validateRow(r, unitOf(r.productId)));
    const firstBad = errors.findIndex((e) => e.qty || e.shelf);
    if (firstBad >= 0) {
      const id = errors[firstBad].qty ? `qty-${rows[firstBad].key}` : `shelf-${rows[firstBad].key}`;
      document.getElementById(id)?.focus();
      return;
    }

    const items: { product_id: string; quantity: number; shelf_life_hours: number }[] = rows.map(
      (r) => {
        const qty = Number(r.qty);
        const shelf = Number(r.shelf);
        return {
          product_id: r.productId,
          quantity: qty,
          shelf_life_hours: r.shelfUnit === 'd' ? shelf * 24 : shelf,
        };
      },
    );

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
      setSubmitted(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
      await onChanged();
    }
  };

  const out = restock.filter((r) => r.status === 'out');
  const low = restock.filter((r) => r.status === 'low');


  const isDirty =
    number.trim() !== '' ||
    rows.length > 1 ||
    rows.some((r) => r.productId || r.qty || r.shelf);

  const clearForm = () => {
    setConfirmClear(false);
    setNumber('');
    setRows([newRow()]);
    setSubmitted(false);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {result && (
        <div
          ref={resultRef}
          className="animate-pop-in scroll-mt-4 rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold text-emerald-300">
                <Icon name="checkCircle" size={20} />
                Поставка принята
              </div>
              <div className="mt-1 break-all font-mono text-sm text-gray-400">{result.number}</div>
            </div>
            <button
              onClick={() => setResult(null)}
              className="rounded-lg p-1 text-gray-500 hover:bg-hover hover:text-gray-200"
              aria-label="Закрыть"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
          <ul className="mt-4 space-y-2">
            {result.batches.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-800 bg-surface px-3 py-2 text-sm"
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

      <div className="stagger grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_380px]">
        {/* Форма поставки */}
        <section
          ref={formRef}
          className="order-2 scroll-mt-4 rounded-2xl border border-gray-800 bg-surface p-4 sm:p-5 xl:order-1"
        >
          <h2 className="mb-4 text-base font-semibold text-gray-100">Новая поставка</h2>

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

          <div>
            {rows.map((r, idx) => {
              const unit = unitOf(r.productId);
              const errs = visibleErrors[idx];
              const isPcs = unit === 'pcs';
              return (
                <div
                  key={r.key}
                  className={
                    'mt-3 grid grid-rows-[1fr] first:mt-0 ' +
                    (leaving.includes(r.key) ? 'animate-row-out' : 'animate-row-in')
                  }
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-800 bg-inset p-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <label className={LABEL_TEXT} htmlFor={`product-${r.key}`}>
                            Продукт
                            {rows.length > 1 && <span className="text-gray-600"> · позиция {idx + 1}</span>}
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
                        <Select
                          id={`product-${r.key}`}
                          value={r.productId}
                          onChange={(v) => patchRow(r.key, { productId: v })}
                          placeholder="Выберите продукт…"
                          options={sortedProducts.map((p) => ({ value: p.id, label: `${p.name} (${unitLabel(p.unit)})` }))}
                          className={INPUT}
                        />
                      </div>

                      <div>
                        <label className={LABEL} htmlFor={`qty-${r.key}`}>
                          Количество
                        </label>
                        <div className="relative">
                          <input
                            id={`qty-${r.key}`}
                            type="text"
                            inputMode={isPcs ? 'numeric' : 'decimal'}
                            value={r.qty}
                            onChange={(e) => {
                              let next = sanitizeNumeric(e.target.value);
                              if (isPcs) {
                                next = next.split('.')[0];
                              } else {
                                const dot = next.indexOf('.');
                                if (dot >= 0) {
                                  next = next.slice(0, dot + 1) + next.slice(dot + 1, dot + 4);
                                }
                              }
                              patchRow(r.key, { qty: next });
                            }}
                            placeholder="0"
                            className={
                              INPUT +
                              ' pr-10' +
                              (errs.qty ? ' border-red-500 focus:border-red-500' : '')
                            }
                            aria-invalid={!!errs.qty}
                            aria-describedby={errs.qty ? `qty-${r.key}-error` : undefined}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-500">
                            {unitLabel(unit)}
                          </span>
                        </div>
                        {errs.qty && (
                          <p id={`qty-${r.key}-error`} className="animate-fade-up mt-1 text-xs text-red-400">
                            {errs.qty}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className={LABEL} htmlFor={`shelf-${r.key}`}>
                          Срок хранения
                        </label>
                        <div className="flex gap-2">
                          <input
                            id={`shelf-${r.key}`}
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            value={r.shelf}
                            onChange={(e) => patchRow(r.key, { shelf: e.target.value })}
                            placeholder="0"
                            className={
                              INPUT +
                              ' min-w-0' +
                              (errs.shelf ? ' border-red-500 focus:border-red-500' : '')
                            }
                            aria-invalid={!!errs.shelf}
                            aria-describedby={errs.shelf ? `shelf-${r.key}-error` : undefined}
                          />
                          <Select
                            value={r.shelfUnit}
                            onChange={(v) => patchRow(r.key, { shelfUnit: v as 'h' | 'd' })}
                            options={[
                              { value: 'd', label: 'сут' },
                              { value: 'h', label: 'ч' },
                            ]}
                            className={FIELD + ' w-20 shrink-0'}
                            aria-label="Единица срока хранения"
                          />
                        </div>
                        {errs.shelf && (
                          <p id={`shelf-${r.key}-error`} className="animate-fade-up mt-1 text-xs text-red-400">
                            {errs.shelf}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setRows((prev) => [...prev, newRow()])}
            className="group mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-700 py-2 text-sm text-gray-400 hover:border-accent hover:bg-accent-soft hover:text-accent-text"
          >
            <Icon name="plus" size={16} className="transition-transform duration-200 group-hover:rotate-90" />
            Добавить позицию
          </button>

          <p className="mt-4 text-xs text-gray-500">
            Срок годности партии = дата поставки + срок хранения. Один продукт можно принять несколькими
            позициями с разными сроками — это будут разные партии.
          </p>

          {error && (
            <div className="animate-fade-up mt-4 flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              <Icon name="alertTriangle" size={16} className="mt-0.5" />
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              onClick={submit}
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 font-medium text-white shadow-md shadow-indigo-500/25 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
            >
              {submitting ? (
                <>
                  <Icon name="loader" size={18} className="animate-spin" />
                  Принимаем…
                </>
              ) : (
                'Принять поставку'
              )}
            </button>

            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={submitting || !isDirty}
              className="w-full rounded-lg border border-gray-700 py-2.5 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-6"
            >
              Очистить
            </button>
          </div>

          {hasErrors && (
            <p className="animate-fade-up mt-2 text-xs text-red-400">
              Исправьте ошибки в форме — отправка заблокирована.
            </p>
          )}
        </section>

        {/* Что нужно заказать */}
        <aside className="order-1 rounded-2xl border border-gray-800 bg-surface p-4 sm:p-5 xl:order-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-100">Что нужно заказать</h2>
            {restock.length > 0 && <span className="text-xs text-gray-500">{restock.length}</span>}
          </div>
          <p className="mb-4 text-xs text-gray-600">
            Остатки без просроченных партий. Рекомендация — пополнить до двух минимальных норм.
          </p>

          {restock.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-4 text-sm text-emerald-300">
              <Icon name="checkCircle" size={18} />
              Запасов хватает по всем продуктам
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
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft py-2 text-sm font-medium text-accent-text hover:bg-accent/25"
              >
                <Icon name="plus" size={16} />
                Добавить все в поставку
              </button>
            </>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Очистить форму?"
        message="Введённые данные будут потеряны."
        confirmLabel="Очистить"
        danger
        onConfirm={clearForm}
        onCancel={() => setConfirmClear(false)}
      />
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
      <ul className="stagger space-y-2">
        {items.map((it) => {
          const added = inForm(it.product_id);
          return (
            <li key={it.product_id} className="rounded-lg border border-gray-800 bg-inset p-3 transition-colors hover:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-100">{it.name}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {it.quantity <= 0
                      ? 'нет в наличии'
                      : it.status === 'out'
                        ? `осталось ${formatQty(it.quantity, it.unit)}`
                        : `осталось ${formatQty(it.quantity, it.unit)}`}
                    {' · '}минимум {formatQty(it.min_stock, it.unit)}
                  </div>
                  {it.blocked_dishes > 0 && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
                      <Icon name="ban" size={13} />
                      <span>
                        Из-за продукта не готовятся {it.blocked_dishes}{' '}
                        {plural(it.blocked_dishes, ['блюдо', 'блюда', 'блюд'])}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onAdd(it)}
                  disabled={added}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:border-accent hover:bg-hover hover:text-accent-text disabled:cursor-default disabled:border-emerald-800 disabled:text-emerald-400 disabled:hover:bg-transparent"
                >
                  {added ? (
                    <>
                      <Icon name="check" size={13} className="animate-pop-in" />в поставке
                    </>
                  ) : (
                    <>
                      <Icon name="plus" size={13} />в поставку
                    </>
                  )}
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