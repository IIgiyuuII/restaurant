import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HotOffer } from '../types';
import { Tone, colors, mono } from '../theme';
import { formatMoney, plural } from '../utils';
import ExpiryBadge from './ExpiryBadge';
import Pill from './Pill';

type Props = {
  offer: HotOffer;
  rank: number;
  topScore: number;
  inCart: number;
  onAdd: () => void;
  compact?: boolean;
};

const LEVELS: Record<HotOffer['level'], { label: string; tone: Tone; border: string; bar: string }> = {
  critical: { label: '🔥 Срочно', tone: 'red', border: 'rgba(127,29,29,0.6)', bar: '#ef4444' },
  high: { label: '⏳ Скоро', tone: 'yellow', border: 'rgba(113,63,18,0.5)', bar: '#eab308' },
  medium: { label: '💡 Желательно', tone: 'green', border: colors.border, bar: '#10b981' },
};

export default function HotOfferCard({ offer, rank, topScore, inCart, onAdd, compact }: Props) {
  const lvl = LEVELS[offer.level];
  const pct = topScore > 0 ? Math.max(6, (offer.score / topScore) * 100) : 0;
  const reasons = compact ? offer.reasons.slice(0, 1) : offer.reasons;
  const maxed = inCart >= offer.portions;

  return (
    <View style={[styles.card, { borderColor: lvl.border }]}>
      <View style={styles.head}>
        <View style={styles.rank}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{offer.name}</Text>
          <View style={{ marginTop: 4 }}>
            <Pill label={lvl.label} tone={lvl.tone} />
          </View>
          <Text style={styles.sub}>
            {formatMoney(offer.price)} · доступно {offer.portions}{' '}
            {plural(offer.portions, ['порция', 'порции', 'порций'])}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.sub}>приоритет</Text>
          <Text style={styles.score}>{offer.score.toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.barBg}>
        <View style={[styles.bar, { width: `${pct}%`, backgroundColor: lvl.bar }]} />
      </View>

      <Text style={styles.why}>ПОЧЕМУ РЕКОМЕНДУЕМ</Text>
      {reasons.map((r) => (
        <View key={r.batch_id} style={styles.reason}>
          <Text style={styles.reasonText}>{r.text}</Text>
          <ExpiryBadge expiry={r.expires_at} />
        </View>
      ))}

      <View style={styles.footer}>
        <Pressable disabled={maxed} onPress={onAdd} style={[styles.btn, maxed && { opacity: 0.4 }]}>
          <Text style={styles.btnText}>+ В заказ</Text>
        </Pressable>
        {inCart > 0 && <Text style={styles.inCart}>в заказе: {inCart}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  head: { flexDirection: 'row', gap: 10 },
  rank: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { color: '#d1d5db', fontSize: 12, fontFamily: mono },
  name: { color: colors.strong, fontSize: 17, fontWeight: '500' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 4 },
  score: { color: colors.strong, fontFamily: mono, fontSize: 15 },
  barBg: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 12 },
  bar: { height: 6 },
  why: { color: '#4b5563', fontSize: 11, letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  reason: {
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 6, gap: 6,
  },
  reasonText: { color: '#d1d5db', fontSize: 13 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  btn: { backgroundColor: colors.emeraldBtn, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { color: '#030712', fontWeight: '600' },
  inCart: { color: colors.emerald, fontSize: 12 },
});