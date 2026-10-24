import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { api, errorMessage } from '../api';
import { useTheme } from '../theme/ThemeProvider';
import type { DeliveryResult, Product, RestockItem } from '../types';
import ExpiryBadge from '../ui/Badge';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import Field, { FieldLabel } from '../ui/Field';
import Notice from '../ui/Notice';
import Panel from '../ui/Panel';
import Screen from '../ui/Screen';
import Select from '../ui/Select';
import Txt from '../ui/Txt';
import { DISHES, formatDate, formatQty, plural, unitLabel } from '../utils';

type Props = { products: Product[]; restock: RestockItem[]; onChanged: () => Promise<void> };
type Row = { key: number; productId: string; qty: string; shelf: string; shelfUnit: 'h' | 'd' };

// ---- Бизнес-лимиты (как в вебе) ----
const MAX_QTY: Record<string, number> = { g: 100_000, ml: 100_000, pcs: 1_000 };
const maxQtyFor = (u: string) => MAX_QTY[u] ?? 100_000;
const MAX_SHELF_HOURS = 24 * 365;
const MAX_SHELF_DAYS = 365;

const hasAtMostThreeDecimals = (raw: string) => {
  const dot = raw.indexOf('.');
  return dot < 0 || raw.slice(dot + 1).replace(/0+$/, '').length <= 3;
};
const sanitizeNumeric = (raw: string) => {
  let s = raw.replace(',', '.').replace(/[^\d.]/g, '');
  const d = s.indexOf('.');
  if (d >= 0) s = s.slice(0, d + 1) + s.slice(d + 1).replace(/\./g, '');
  return s;
};

type RowErrors = { qty?: string; shelf?: string; product?: string };
function validateRow(row: Row, unit: string): RowErrors {
  const e: RowErrors = {};
  if (!row.productId) return { product: 'Выберите продукт' };
  const qty = Number(row.qty);
  const shelf = Number(row.shelf);
  if (row.qty === '' || !(qty > 0)) e.qty = 'Укажите количество больше 0';
  else if (qty > maxQtyFor(unit)) e.qty = `Максимум ${maxQtyFor(unit).toLocaleString('ru-RU')} ${unitLabel(unit)}`;
  else if (unit === 'pcs' && !Number.isInteger(qty)) e.qty = 'Количество штук должно быть целым числом';
  else if ((unit === 'g' || unit === 'ml') && !hasAtMostThreeDecimals(row.qty)) e.qty = 'Не больше трёх знаков после запятой';

  if (row.shelf === '' || !(shelf > 0)) e.shelf = 'Укажите срок больше 0';
  else if (!Number.isInteger(shelf)) e.shelf = 'Срок должен быть целым числом';
  else {
    const max = row.shelfUnit === 'd' ? MAX_SHELF_DAYS : MAX_SHELF_HOURS;
    if (shelf > max) e.shelf = `Максимум ${max} ${row.shelfUnit === 'd' ? 'суток' : 'часов'}`;
  }
  return e;
}

let nextKey = 1;
const newRow = (): Row => ({ key: nextKey++, productId: '', qty: '', shelf: '', shelfUnit: 'd' });

export default function DeliveryScreen({ products, restock, onChanged }: Props) {
  const { c } = useTheme();
  const [number, setNumber] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryResult | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const sorted = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name, 'ru')), [products]);
  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit ?? '';
  const patch = (key: number, p: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const errors = rows.map((r) => validateRow(r, unitOf(r.productId)));
  const shown = (i: number): RowErrors => (submitted ? errors[i] : {});
  const hasErrors = submitted && errors.some((e) => e.qty || e.shelf || e.product);

  const withSuggestion = (list: Row[], item: RestockItem): Row[] => {
    if (list.some((r) => r.productId === item.product_id)) return list;
    const fill = { productId: item.product_id, qty: item.suggested_quantity > 0 ? String(item.suggested_quantity) : '' };
    const empty = list.findIndex((r) => !r.productId && !r.qty && !r.shelf);
    return empty >= 0 ? list.map((r, i) => (i === empty ? { ...r, ...fill } : r)) : [...list, { ...newRow(), ...fill }];
  };
  const inForm = (id: string) => rows.some((r) => r.productId === id);
  const isDirty = number.trim() !== '' || rows.length > 1 || rows.some((r) => r.productId || r.qty || r.shelf);

  const submit = async () => {
    if (submitting) return;
    setSubmitted(true);
    if (errors.some((e) => e.qty || e.shelf || e.product)) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<DeliveryResult>('/deliveries', {
        number: number.trim() || undefined,
        items: rows.map((r) => ({ product_id: r.productId, quantity: Number(r.qty), shelf_life_hours: r.shelfUnit === 'd' ? Number(r.shelf) * 24 : Number(r.shelf) })),
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

  const clear = () => { setConfirmClear(false); setNumber(''); setRows([newRow()]); setSubmitted(false); setError(null); };
  const out = restock.filter((r) => r.status === 'out');
  const low = restock.filter((r) => r.status === 'low');

  return (
    <Screen gap={20}>
      {result && (
        <Panel tint={{ bg: c.tones.green.bg, border: c.tones.green.border }} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Txt w="semi" size={15} c={c.tones.green.color}>Поставка принята</Txt>
              <Txt mono size={12} c="muted" style={{ marginTop: 2 }}>{result.number}</Txt>
            </View>
            <Button label="Закрыть" size="sm" variant="ghost" onPress={() => setResult(null)} />
          </View>
          {result.batches.map((b) => (
            <View key={b.id} style={{ borderRadius: 10, backgroundColor: c.inset, padding: 10, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={13} c="body" style={{ flex: 1 }}>{b.product}</Txt>
                <Txt mono size={13} c="soft">{formatQty(b.quantity, b.unit)}</Txt>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt size={12} c="muted">годна до {formatDate(b.expires_at)}</Txt>
                <ExpiryBadge expiry={b.expires_at} />
              </View>
            </View>
          ))}
        </Panel>
      )}

      <Panel>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Txt w="semi" size={16} c="strong">Что нужно заказать</Txt>
          {restock.length > 0 && <Txt size={12} c="muted">{restock.length}</Txt>}
        </View>
        <Txt size={12} c="faint" style={{ marginBottom: 12 }}>Остатки без просроченных партий. Рекомендация — пополнить до двух минимальных норм.</Txt>
        {restock.length === 0 ? <Notice kind="success">Запасов хватает по всем продуктам</Notice> : (
          <View style={{ gap: 14 }}>
            {([['Отсутствуют', 'red', out], ['Заканчиваются', 'yellow', low]] as const).map(([title, tone, items]) => items.length > 0 && (
              <View key={title} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.tones[tone].color }} />
                  <Txt w="medium" size={11} c={c.tones[tone].color} upper tracking={0.6}>{title} · {items.length}</Txt>
                </View>
                {items.map((it) => {
                  const added = inForm(it.product_id);
                  return (
                    <View key={it.product_id} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.inset, padding: 12, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Txt w="medium" size={14} c="strong">{it.name}</Txt>
                          <Txt size={12} c="muted">{it.quantity <= 0 ? 'нет в наличии' : `осталось ${formatQty(it.quantity, it.unit)}`} · минимум {formatQty(it.min_stock, it.unit)}</Txt>
                          {it.blocked_dishes > 0 && <Txt size={12} c={c.tones.red.color}>Из-за продукта не готовятся {it.blocked_dishes} {plural(it.blocked_dishes, DISHES)}</Txt>}
                        </View>
                        <Button size="sm" variant="outline" icon={added ? 'check' : 'plus'} label={added ? 'в поставке' : 'в поставку'} disabled={added} onPress={() => setRows((p) => withSuggestion(p, it))} />
                      </View>
                      {it.suggested_quantity > 0 && <Txt size={12} c="muted">Заказать ≈ <Txt mono size={12} c="strong">{formatQty(it.suggested_quantity, it.unit)}</Txt></Txt>}
                    </View>
                  );
                })}
              </View>
            ))}
            <Button label="Добавить все в поставку" variant="soft" icon="plus" onPress={() => setRows((p) => restock.reduce(withSuggestion, p))} full />
          </View>
        )}
      </Panel>

      <Panel style={{ gap: 14 }}>
        <Txt w="semi" size={16} c="strong">Новая поставка</Txt>
        <Field label="Номер поставки" value={number} onChangeText={setNumber} placeholder="Необязательно — сформируется сам" maxLength={64} />

        {rows.map((r, idx) => {
          const unit = unitOf(r.productId);
          const e = shown(idx);
          return (
            <View key={r.key} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.inset, padding: 12, gap: 12 }}>
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <FieldLabel>{rows.length > 1 ? `Продукт · позиция ${idx + 1}` : 'Продукт'}</FieldLabel>
                  {rows.length > 1 && <Txt size={12} c="muted" onPress={() => setRows((p) => (p.length > 1 ? p.filter((x) => x.key !== r.key) : p))}>Удалить</Txt>}
                </View>
                <Select value={r.productId} onChange={(v) => patch(r.key, { productId: v })} placeholder="Выберите продукт…" title="Продукт"
                  options={sorted.map((p) => ({ value: p.id, label: `${p.name} (${unitLabel(p.unit)})` }))} />
                {e.product && <Txt size={12} c={c.danger} style={{ marginTop: 4 }}>{e.product}</Txt>}
              </View>
              <Field label="Количество" value={r.qty} keyboardType={unit === 'pcs' ? 'number-pad' : 'decimal-pad'} placeholder="0" suffix={unit ? unitLabel(unit) : undefined} error={e.qty}
                onChangeText={(v) => {
                  let n = sanitizeNumeric(v);
                  if (unit === 'pcs') n = n.split('.')[0];
                  else { const d = n.indexOf('.'); if (d >= 0) n = n.slice(0, d + 1) + n.slice(d + 1, d + 4); }
                  patch(r.key, { qty: n });
                }} />
              <View>
                <FieldLabel>Срок хранения</FieldLabel>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Field value={r.shelf} onChangeText={(v) => patch(r.key, { shelf: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="0" error={e.shelf} style={{ flex: 1 }} />
                  <View style={{ width: 92 }}>
                    <Select value={r.shelfUnit} onChange={(v) => patch(r.key, { shelfUnit: v as 'h' | 'd' })} title="Единица срока"
                      options={[{ value: 'd', label: 'сут' }, { value: 'h', label: 'ч' }]} />
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        <Button label="Добавить позицию" variant="outline" icon="plus" onPress={() => setRows((p) => [...p, newRow()])} full />
        <Txt size={12} c="muted">Срок годности партии = дата поставки + срок хранения. Один продукт можно принять несколькими позициями с разными сроками — это будут разные партии.</Txt>

        {error && <Notice kind="error">{error}</Notice>}
        {hasErrors && <Txt size={12} c={c.danger}>Исправьте ошибки в форме — отправка заблокирована.</Txt>}
        <Button label={submitting ? 'Принимаем…' : 'Принять поставку'} loading={submitting} onPress={() => void submit()} full />
        <Button label="Очистить" variant="outline" disabled={submitting || !isDirty} onPress={() => setConfirmClear(true)} full />
      </Panel>

      <ConfirmDialog open={confirmClear} title="Очистить форму?" message="Введённые данные будут потеряны." confirmLabel="Очистить" danger onConfirm={clear} onCancel={() => setConfirmClear(false)} />
    </Screen>
  );
}
