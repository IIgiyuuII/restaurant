import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import axios from 'axios';

import { api, errorMessage } from '../api';
import type { Cart, Dish, OrderHistoryEntry, OrderResult } from '../types';
import { colors, mono } from '../theme';
import { formatDate, formatMoney, plural } from '../utils';
import OrderResultCard from './OrderResultCard';
import Pill from './Pill';
import SectionTitle from './SectionTitle';

type Props = {
  dishes: Dish[];
  history: OrderHistoryEntry[];
  cart: Cart;
  setCart: Dispatch<SetStateAction<Cart>>;
  onChanged: () => Promise<void>;
};

const MAX_PER_DISH = 100;
const PORTIONS: [string, string, string] = ['порция', 'порции', 'порций'];

export default function OrdersPage({ dishes, history, cart, setCart, onChanged }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qtyOf = (d: Dish) => Math.min(cart[d.id] ?? 0, Math.max(d.portions, 0), MAX_PER_DISH);

  const lines = dishes.filter((d) => qtyOf(d) > 0);
  const total = lines.reduce((sum, d) => sum + d.price * qtyOf(d), 0);
  const totalPortions = lines.reduce((sum, d) => sum + qtyOf(d), 0);

  const change = (d: Dish, delta: number) =>
    setCart((prev) => {
      const next = Math.max(0, Math.min(qtyOf(d) + delta, d.portions, MAX_PER_DISH));
      return { ...prev, [d.id]: next };
    });

  const submit = async () => {
    if (lines.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<OrderResult>('/orders', {
        items: lines.map((d) => ({ dish_id: d.id, quantity: qtyOf(d) })),
      });
      setResult(data);
      setCart({});
    } catch (e) {
      // 409 с телом rejected — штатный отказ из-за нехватки ингредиентов.
      if (axios.isAxiosError(e) && e.response?.status === 409 && e.response.data?.status === 'rejected') {
        setResult(e.response.data as OrderResult);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setSubmitting(false);
      await onChanged();
    }
  };

  return (
    <View>
      <SectionTitle>Меню</SectionTitle>
      {dishes.map((d) => {
        const qty = qtyOf(d);
        const stopped = d.portions <= 0;
        return (
          <View
            key={d.id}
            style={[
              styles.dish,
              stopped && { opacity: 0.6 },
              qty > 0 && { borderColor: 'rgba(4,120,87,0.6)', backgroundColor: 'rgba(2,44,34,0.15)' },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.dishName}>{d.name}</Text>
              <Text style={styles.price}>{formatMoney(d.price)}</Text>
              {stopped ? (
                <Text style={{ color: colors.red, fontSize: 12, marginTop: 2 }}>🚫 стоп-лист</Text>
              ) : (
                <Text style={{ color: d.portions <= 3 ? colors.yellow : colors.muted, fontSize: 12, marginTop: 2 }}>
                  доступно {d.portions} {plural(d.portions, PORTIONS)}
                </Text>
              )}
            </View>
            <View style={styles.counter}>
              <Pressable
                style={[styles.cbtn, (stopped || qty === 0) && styles.cbtnOff]}
                disabled={stopped || qty === 0}
                onPress={() => change(d, -1)}
              >
                <Text style={styles.cbtnText}>−</Text>
              </Pressable>
              <Text style={styles.qty}>{qty}</Text>
              <Pressable
                style={[styles.cbtn, (stopped || qty >= d.portions) && styles.cbtnOff]}
                disabled={stopped || qty >= d.portions}
                onPress={() => change(d, 1)}
              >
                <Text style={styles.cbtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <View style={{ height: 12 }} />
      <SectionTitle>Заказ</SectionTitle>
      <View style={styles.cart}>
        {lines.length === 0 ? (
          <Text style={styles.cartEmpty}>Добавьте блюда из меню</Text>
        ) : (
          lines.map((d) => (
            <View key={d.id} style={styles.cartLine}>
              <Text style={{ color: '#e5e7eb', flex: 1 }}>
                {d.name} <Text style={{ color: colors.muted }}>× {qtyOf(d)}</Text>
              </Text>
              <Text style={styles.mono}>{formatMoney(d.price * qtyOf(d))}</Text>
            </View>
          ))
        )}

        <View style={styles.totalRow}>
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>
            Итого · {totalPortions} {plural(totalPortions, PORTIONS)}
          </Text>
          <Text style={styles.total}>{formatMoney(total)}</Text>
        </View>

        <Pressable
          onPress={submit}
          disabled={lines.length === 0 || submitting}
          style={[styles.submit, (lines.length === 0 || submitting) && { opacity: 0.4 }]}
        >
          {submitting ? (
            <ActivityIndicator color="#030712" />
          ) : (
            <Text style={styles.submitText}>Оформить заказ</Text>
          )}
        </Pressable>

        {lines.length > 0 && (
          <Pressable onPress={() => setCart({})} style={{ marginTop: 10 }}>
            <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13 }}>Очистить</Text>
          </Pressable>
        )}

        {error && (
          <View style={styles.err}>
            <Text style={{ color: '#fca5a5', fontSize: 13 }}>{error}</Text>
          </View>
        )}
      </View>

      <View style={{ height: 16 }} />
      {result && <OrderResultCard result={result} onClose={() => setResult(null)} />}

      <SectionTitle>Последние заказы</SectionTitle>
      {history.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>Заказов пока нет</Text>
      ) : (
        history.map((o) => (
          <View key={o.id} style={styles.hist}>
            <View style={styles.histTop}>
              <Text style={styles.mono}>№{o.number}</Text>
              <Text style={{ color: '#9ca3af', fontSize: 12 }}>{formatDate(o.created_at)}</Text>
              {o.status === 'created' ? (
                <Pill label="оформлен" tone="green" />
              ) : (
                <Pill label="отклонён" tone="red" />
              )}
            </View>
            <Text style={{ color: '#e5e7eb', fontSize: 13, marginTop: 6 }}>
              {o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
            </Text>
            {o.status === 'rejected' && o.reason ? (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{o.reason}</Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dish: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1,
    borderRadius: 14, padding: 14, marginBottom: 8,
  },
  dishName: { color: colors.strong, fontSize: 16 },
  price: { color: '#d1d5db', fontSize: 13, marginTop: 2 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cbtn: {
    width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  cbtnOff: { opacity: 0.3 },
  cbtnText: { color: '#d1d5db', fontSize: 20 },
  qty: { width: 28, textAlign: 'center', color: colors.strong, fontFamily: mono, fontSize: 16 },
  cart: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16 },
  cartEmpty: { color: colors.muted, textAlign: 'center', paddingVertical: 16, fontSize: 13 },
  cartLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  mono: { color: '#d1d5db', fontFamily: mono, fontSize: 13 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 12, marginVertical: 12,
  },
  total: { color: colors.strong, fontSize: 18, fontWeight: '600' },
  submit: { backgroundColor: colors.emeraldBtn, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitText: { color: '#030712', fontWeight: '600', fontSize: 15 },
  err: {
    marginTop: 12, borderColor: '#991b1b', borderWidth: 1,
    backgroundColor: 'rgba(69,10,10,0.4)', borderRadius: 10, padding: 10,
  },
  hist: {
    backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1,
    borderRadius: 12, padding: 12, marginBottom: 8,
  },
  histTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});