import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OrderResult } from '../types';
import { colors, mono } from '../theme';
import { formatDate, formatQty } from '../utils';
import ExpiryBadge from './ExpiryBadge';

type Props = { result: OrderResult; onClose: () => void };

export default function OrderResultCard({ result, onClose }: Props) {
  const ok = result.status === 'created';

  return (
    <View style={[styles.card, ok ? styles.ok : styles.bad]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: ok ? '#6ee7b7' : '#fca5a5' }]}>
            {ok ? `✅ Заказ №${result.number} оформлен` : `⛔ Заказ №${result.number} отклонён`}
          </Text>
          <Text style={styles.items}>
            {result.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>

      {ok && result.write_offs && (
        <View style={{ marginTop: 14 }}>
          <Text style={styles.cap}>СПИСАНО СО СКЛАДА (СНАЧАЛА ПАРТИИ С БЛИЖАЙШИМ СРОКОМ)</Text>
          {result.write_offs.map((w) => (
            <View key={w.batch_id} style={styles.row}>
              <Text style={styles.product}>{w.product}</Text>
              <Text style={styles.minus}>−{formatQty(w.quantity, w.unit)}</Text>
              <Text style={styles.muted}>партия до {formatDate(w.expires_at)}</Text>
              <ExpiryBadge expiry={w.expires_at} />
            </View>
          ))}
        </View>
      )}

      {!ok && (
        <View style={{ marginTop: 14 }}>
          <Text style={styles.cap}>НЕ ХВАТАЕТ ИНГРЕДИЕНТОВ</Text>
          {(result.shortages ?? []).map((s) => (
            <View key={s.product_id} style={styles.row}>
              <Text style={styles.product}>{s.product}</Text>
              <Text style={styles.muted}>
                нужно {formatQty(s.needed, s.unit)}, есть {formatQty(s.available, s.unit)}
              </Text>
              <Text style={[styles.minus, { color: '#fca5a5' }]}>
                не хватает {formatQty(s.needed - s.available, s.unit)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16 },
  ok: { borderColor: 'rgba(6,95,70,0.5)', backgroundColor: 'rgba(2,44,34,0.2)' },
  bad: { borderColor: 'rgba(127,29,29,0.6)', backgroundColor: 'rgba(69,10,10,0.2)' },
  head: { flexDirection: 'row', gap: 10 },
  title: { fontSize: 16, fontWeight: '600' },
  items: { color: '#9ca3af', fontSize: 13, marginTop: 4 },
  close: { color: colors.muted, fontSize: 24, lineHeight: 24 },
  cap: { color: colors.muted, fontSize: 11, letterSpacing: 0.5, marginBottom: 8 },
  row: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 10, marginBottom: 6, gap: 4 },
  product: { color: colors.text, fontSize: 14 },
  minus: { color: '#6ee7b7', fontFamily: mono, fontSize: 13 },
  muted: { color: colors.muted, fontSize: 12 },
});