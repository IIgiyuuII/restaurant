import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, View } from 'react-native';
import axios from 'axios';
import { api, errorMessage } from '../api';
import { markOwnOrder } from '../notifications/engine';
import { useTheme } from '../theme/ThemeProvider';
import type { Cart, Dish, OrderHistoryEntry, OrderResult } from '../types';
import { Badge } from '../ui/Badge';
import Button, { IconButton } from '../ui/Button';
import Icon from '../ui/Icon';
import Notice from '../ui/Notice';
import Panel from '../ui/Panel';
import Screen from '../ui/Screen';
import Sheet from '../ui/Sheet';
import Txt from '../ui/Txt';
import ExpiryBadge from '../ui/Badge';
import { PORTIONS, formatDate, formatMoney, formatQty, plural } from '../utils';

type Props = {
  dishes: Dish[];
  history: OrderHistoryEntry[];
  cart: Cart;
  setCart: Dispatch<SetStateAction<Cart>>;
  onChanged: () => Promise<void>;
};

const MAX_PER_DISH = 100;

export default function OrdersScreen({ dishes, history, cart, setCart, onChanged }: Props) {
  const { c } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  const qtyOf = (d: Dish) => Math.min(cart[d.id] ?? 0, Math.max(d.portions, 0), MAX_PER_DISH);
  const lines = dishes.filter((d) => qtyOf(d) > 0);
  const total = lines.reduce((s, d) => s + d.price * qtyOf(d), 0);
  const portions = lines.reduce((s, d) => s + qtyOf(d), 0);

  const change = (d: Dish, delta: number) =>
    setCart((prev) => ({ ...prev, [d.id]: Math.max(0, Math.min((prev[d.id] ?? 0) + delta, Math.max(d.portions, 0), MAX_PER_DISH)) }));

  const submit = async () => {
    if (!lines.length || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<OrderResult>('/orders', { items: lines.map((d) => ({ dish_id: d.id, quantity: qtyOf(d) })) });
      setResult(data);
      setCart({});
      void markOwnOrder(data.id);
      setSheet(false);
    } catch (e) {
      // 409 с телом rejected — штатный отказ из-за нехватки ингредиентов.
      if (axios.isAxiosError(e) && e.response?.status === 409 && e.response.data?.status === 'rejected') {
        const r = e.response.data as OrderResult;
        setResult(r);
        void markOwnOrder(r.id);
        setSheet(false);
      } else setError(errorMessage(e));
    } finally {
      setSubmitting(false);
      await onChanged();
    }
  };

  const bar = lines.length > 0 ? (
    <View style={{ paddingTop: 8, paddingBottom: 4, backgroundColor: c.page.base }}>
      <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, backgroundColor: c.popover, borderColor: c.accent + '66' }}>
        <View style={{ flex: 1 }}>
          <Txt w="semi" size={16} c="strong">{formatMoney(total)}</Txt>
          <Txt size={12} c="muted">{portions} {plural(portions, PORTIONS)}</Txt>
        </View>
        <Button label="Оформить" icon="receipt" onPress={() => setSheet(true)} />
      </Panel>
    </View>
  ) : undefined;

  return (
    <Screen sticky={bar} gap={20}>
      {result && <ResultCard result={result} onClose={() => setResult(null)} />}

      <View style={{ gap: 10 }}>
        <Txt w="semi" size={16} c="strong">Меню</Txt>
        {dishes.map((d) => {
          const qty = qtyOf(d);
          const stopped = d.portions <= 0;
          return (
            <Panel key={d.id} tint={qty > 0 ? { bg: c.accentSoft, border: c.accent + '80' } : undefined} style={{ opacity: stopped ? 0.55 : 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt w="medium" size={15} c="strong">{d.name}</Txt>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Txt size={13} c="soft">{formatMoney(d.price)}</Txt>
                  {stopped ? <Txt size={12} c={c.tones.red.color}>В стоп-листе</Txt>
                    : <Txt size={12} c={d.portions <= 3 ? c.tones.yellow.color : 'muted'}>доступно {d.portions} {plural(d.portions, PORTIONS)}</Txt>}
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconButton icon="minus" label={`Убрать ${d.name}`} onPress={() => change(d, -1)} disabled={stopped || qty === 0} size={34} />
                <Txt mono w="semi" size={16} c="strong" style={{ width: 26 }} align="center">{qty}</Txt>
                <IconButton icon="plus" label={`Добавить ${d.name}`} onPress={() => change(d, 1)} disabled={stopped || qty >= d.portions || qty >= MAX_PER_DISH} size={34} />
              </View>
            </Panel>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        <Txt w="semi" size={16} c="strong">Последние заказы</Txt>
        {history.length === 0 ? <Txt size={14} c="muted">Заказов пока нет</Txt> : history.map((o) => (
          <Panel key={o.id} style={{ gap: 8, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt mono w="semi" size={14} c="strong">№{o.number}</Txt>
                <Txt size={12} c="muted">{formatDate(o.created_at)}</Txt>
              </View>
              <Badge tone={o.status === 'created' ? 'green' : 'red'}>{o.status === 'created' ? 'оформлен' : 'отклонён'}</Badge>
            </View>
            <Txt size={13} c="body">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</Txt>
            {o.status === 'created'
              ? <Txt mono size={13} c="soft">{o.revenue_estimated ? '≈ ' : ''}{formatMoney(o.revenue)}</Txt>
              : o.reason ? <Txt size={12} c="muted">{o.reason}</Txt> : null}
          </Panel>
        ))}
      </View>

      <Sheet visible={sheet} onClose={() => !submitting && setSheet(false)} title="Состав заказа">
        <View style={{ gap: 12 }}>
          {lines.map((d) => (
            <View key={d.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt size={14} c="body">{d.name}</Txt>
                <Txt size={12} c="muted">{formatMoney(d.price)} × {qtyOf(d)}</Txt>
              </View>
              <Txt mono size={14} c="soft">{formatMoney(d.price * qtyOf(d))}</Txt>
            </View>
          ))}
          <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Txt size={14} c="muted">Итого · {portions} {plural(portions, PORTIONS)}</Txt>
            <Txt w="semi" size={20} c="strong">{formatMoney(total)}</Txt>
          </View>
          {error && <Notice kind="error">{error}</Notice>}
          <Button label={submitting ? 'Оформляем…' : 'Оформить заказ'} onPress={() => void submit()} loading={submitting} full />
          <Button label="Очистить корзину" variant="ghost" onPress={() => { setCart({}); setSheet(false); }} disabled={submitting} />
        </View>
      </Sheet>
    </Screen>
  );
}

function ResultCard({ result, onClose }: { result: OrderResult; onClose: () => void }) {
  const { c } = useTheme();
  const ok = result.status === 'created';
  const t = c.tones[ok ? 'green' : 'red'];
  return (
    <Panel tint={{ bg: t.bg, border: t.border }} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Icon name={ok ? 'checkCircle' : 'xCircle'} size={22} color={t.color} />
        <View style={{ flex: 1 }}>
          <Txt w="semi" size={15} c={t.color}>{ok ? `Заказ №${result.number} оформлен` : `Заказ №${result.number} отклонён`}</Txt>
          <Txt size={13} c="muted" style={{ marginTop: 2 }}>{result.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</Txt>
        </View>
        <Pressable onPress={onClose} hitSlop={10}><Icon name="x" size={18} color={c.muted} /></Pressable>
      </View>
      {ok && result.write_offs && result.write_offs.length > 0 && (
        <View style={{ gap: 6 }}>
          <Txt w="medium" size={11} c="muted" upper tracking={0.6}>Списано со склада (по FEFO)</Txt>
          {result.write_offs.map((w) => (
            <View key={w.batch_id} style={{ borderRadius: 10, backgroundColor: c.inset, padding: 10, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={13} c="body" style={{ flex: 1 }}>{w.product}</Txt>
                <Txt mono size={13} c={t.color}>−{formatQty(w.quantity, w.unit)}</Txt>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt size={12} c="muted">партия до {formatDate(w.expires_at)}</Txt>
                <ExpiryBadge expiry={w.expires_at} />
              </View>
            </View>
          ))}
        </View>
      )}
      {!ok && (
        <View style={{ gap: 6 }}>
          <Txt w="medium" size={11} c="muted" upper tracking={0.6}>Не хватает ингредиентов</Txt>
          {(result.shortages ?? []).map((s) => (
            <View key={s.product_id} style={{ borderRadius: 10, backgroundColor: c.inset, padding: 10, gap: 3 }}>
              <Txt size={13} c="body">{s.product}</Txt>
              <Txt size={12} c="muted">нужно {formatQty(s.needed, s.unit)}, есть {formatQty(s.available, s.unit)}</Txt>
              <Txt mono size={12} c={t.color}>не хватает {formatQty(s.needed - s.available, s.unit)}</Txt>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}
