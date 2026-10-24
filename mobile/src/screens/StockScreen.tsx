import { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, View } from 'react-native';
import type { Batch, Product } from '../types';
import { useTheme } from '../theme/ThemeProvider';
import ExpiryBadge, { Badge } from '../ui/Badge';
import Icon from '../ui/Icon';
import Panel from '../ui/Panel';
import ProgressBar from '../ui/ProgressBar';
import Screen from '../ui/Screen';
import Select from '../ui/Select';
import Txt from '../ui/Txt';
import { formatDate, formatQuantity, formatQty, unitLabel } from '../utils';

type Props = { products: Product[]; batches: Batch[] };

export default function StockScreen({ products, batches }: Props) {
  const { c } = useTheme();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [delivery, setDelivery] = useState('');

  const deliveries = useMemo(() => [...new Set(batches.map((b) => b.delivery_number))].sort().reverse(), [batches]);
  const visible = useMemo(() => (delivery ? batches.filter((b) => b.delivery_number === delivery) : batches), [batches, delivery]);
  const byProduct = useMemo(() => {
    const m = new Map<string, Batch[]>();
    for (const b of visible) { const l = m.get(b.product_id); if (l) l.push(b); else m.set(b.product_id, [b]); }
    return m;
  }, [visible]);
  const rows = useMemo(() => (delivery ? products.filter((p) => byProduct.has(p.id)) : products), [products, byProduct, delivery]);

  const anim = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  const toggle = (id: string) => { anim(); setOpen((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const allOpen = rows.length > 0 && rows.every((p) => open.has(p.id));

  return (
    <Screen gap={12}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt w="medium" size={11} c="muted" upper tracking={0.6} style={{ marginBottom: 6 }}>Поставка</Txt>
          <Select value={delivery} onChange={(v) => { setDelivery(v); setOpen(new Set()); }} title="Поставка"
            options={[{ value: '', label: 'Все поставки' }, ...deliveries.map((d) => ({ value: d, label: d }))]} />
        </View>
        {rows.length > 0 && (
          <Pressable onPress={() => { anim(); setOpen(allOpen ? new Set() : new Set(rows.map((p) => p.id))); }} style={{ paddingVertical: 14 }}>
            <Txt size={12} c="muted">{allOpen ? 'Свернуть все' : 'Развернуть все'}</Txt>
          </Pressable>
        )}
      </View>

      {rows.length === 0 ? (
        <Panel><Txt c="muted" align="center" style={{ paddingVertical: 36 }}>{delivery ? 'В этой поставке нет живых партий' : 'Нет данных'}</Txt></Panel>
      ) : rows.map((p) => {
        const list = byProduct.get(p.id) ?? [];
        const isOpen = open.has(p.id);
        const empty = p.quantity === 0;
        const hasExpired = list.some((b) => b.expired);
        return (
          <Panel key={p.id} padded={false}>
            <Pressable onPress={() => list.length > 0 && toggle(p.id)} style={{ padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 18, transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}>
                  {list.length > 0 && <Icon name="chevronRight" size={16} color={c.muted} />}
                </View>
                <Txt w="medium" size={15} c="strong" style={{ flex: 1 }}>{p.name}</Txt>
                {empty ? <Badge>пусто</Badge> : <ExpiryBadge expiry={p.nearest_expiry} />}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingLeft: 28 }}>
                <Txt mono size={18} c={empty ? 'faint' : 'strong'} w="semi">{formatQuantity(p.quantity)}</Txt>
                <Txt size={12} c="muted">{unitLabel(p.unit)}</Txt>
                <Txt size={12} c="faint" style={{ marginLeft: 'auto' }}>
                  {list.length ? `${list.length} парт. · до ${formatDate(p.nearest_expiry)}` : '—'}
                </Txt>
              </View>
              {hasExpired && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 28 }}>
                  <Icon name="alertTriangle" size={13} color={c.tones.red.color} />
                  <Txt size={12} c={c.tones.red.color}>есть просроченные</Txt>
                </View>
              )}
            </Pressable>
            {isOpen && (
              <View style={{ backgroundColor: c.inset, borderTopWidth: 1, borderTopColor: c.divider, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                {list.map((b, i) => {
                  const pct = (b.remaining_quantity / b.initial_quantity) * 100;
                  return (
                    <View key={b.id} style={{ padding: 14, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: c.divider, backgroundColor: b.expired ? 'rgba(127,29,29,0.14)' : 'transparent' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Txt mono size={12} c="soft">{b.delivery_number}</Txt>
                        <ExpiryBadge expiry={b.expires_at} />
                      </View>
                      <ProgressBar pct={pct} color={b.expired ? '#ef4444' : c.accent} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Txt mono size={12} c="soft">{formatQty(b.remaining_quantity, b.unit)} <Txt size={12} c="faint">из {formatQuantity(b.initial_quantity)}</Txt></Txt>
                        <Txt size={12} c="muted">годна до {formatDate(b.expires_at)}</Txt>
                      </View>
                      <Txt size={11} c="faint">получена {formatDate(b.received_at)}{b.expired ? ' · не учитывается в остатках' : ''}</Txt>
                    </View>
                  );
                })}
              </View>
            )}
          </Panel>
        );
      })}
    </Screen>
  );
}
