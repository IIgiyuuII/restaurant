import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Batch, Product } from '../types';
import { colors, mono } from '../theme';
import { formatDate, formatQuantity, formatQty } from '../utils';
import ExpiryBadge from './ExpiryBadge';
import Pill from './Pill';

type Props = { products: Product[]; batches: Batch[] };

export default function StockTable({ products, batches }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  const byProduct = useMemo(() => {
    const map = new Map<string, Batch[]>();
    for (const b of batches) {
      const list = map.get(b.product_id);
      if (list) list.push(b);
      else map.set(b.product_id, [b]);
    }
    return map;
  }, [batches]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (products.length === 0) {
    return <Text style={styles.empty}>Нет данных</Text>;
  }

  return (
    <View>
      {products.map((p) => {
        const list = byProduct.get(p.id) ?? [];
        const isOpen = open.has(p.id);
        const isEmpty = p.quantity === 0;
        const hasExpired = list.some((b) => b.expired);

        return (
          <View key={p.id} style={styles.card}>
            <Pressable
              disabled={list.length === 0}
              onPress={() => toggle(p.id)}
              style={styles.head}
            >
              <View style={styles.top}>
                <Text style={styles.chev}>{list.length > 0 ? (isOpen ? '▾' : '▸') : ''}</Text>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={[styles.qty, isEmpty && { color: '#4b5563' }]}>
                  {formatQty(p.quantity, p.unit)}
                </Text>
              </View>

              <View style={styles.bottom}>
                <Text style={styles.meta}>
                  Партий: {list.length || '—'} · до {formatDate(p.nearest_expiry)}
                </Text>
                {isEmpty ? <Pill label="пусто" tone="gray" /> : <ExpiryBadge expiry={p.nearest_expiry} />}
              </View>

              {hasExpired && <Text style={styles.warn}>⚠ есть просроченные</Text>}
            </Pressable>

            {isOpen && (
              <View style={styles.batches}>
                {list.map((b) => {
                  const pct =
                    b.initial_quantity > 0
                      ? Math.max(0, Math.min(100, (b.remaining_quantity / b.initial_quantity) * 100))
                      : 0;
                  return (
                    <View key={b.id} style={[styles.batch, b.expired && styles.batchExpired]}>
                      <View style={styles.batchTop}>
                        <Text style={styles.delivery}>{b.delivery_number}</Text>
                        <ExpiryBadge expiry={b.expires_at} />
                      </View>
                      <Text style={styles.meta}>
                        Получена {formatDate(b.received_at)} · годна до {formatDate(b.expires_at)}
                      </Text>
                      <View style={styles.progressRow}>
                        <View style={styles.barBg}>
                          <View
                            style={[
                              styles.barFill,
                              { width: `${pct}%`, backgroundColor: b.expired ? '#ef4444' : '#10b981' },
                            ]}
                          />
                        </View>
                        <Text style={styles.batchQty}>
                          {formatQty(b.remaining_quantity, b.unit)}
                          <Text style={styles.meta}> из {formatQuantity(b.initial_quantity)}</Text>
                        </Text>
                      </View>
                      {b.expired && <Text style={styles.warn}>не учитывается в остатках</Text>}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 40 },
  card: {
    backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1,
    borderRadius: 14, marginBottom: 8, overflow: 'hidden',
  },
  head: { padding: 14 },
  top: { flexDirection: 'row', alignItems: 'center' },
  chev: { color: colors.muted, width: 16 },
  name: { flex: 1, color: colors.text, fontSize: 16 },
  qty: { color: colors.strong, fontFamily: mono, fontSize: 15 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  meta: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  warn: { color: colors.red, fontSize: 12, marginTop: 6 },
  batches: { backgroundColor: 'rgba(0,0,0,0.2)', borderTopColor: colors.border, borderTopWidth: 1, padding: 10, gap: 8 },
  batch: { borderColor: 'rgba(31,41,55,0.6)', borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  batchExpired: { backgroundColor: 'rgba(69,10,10,0.2)' },
  batchTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  delivery: { color: '#d1d5db', fontFamily: mono, fontSize: 13 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 6 },
  batchQty: { color: '#d1d5db', fontFamily: mono, fontSize: 12 },
});