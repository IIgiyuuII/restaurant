import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { api, errorMessage } from '../../api';
import { useTheme } from '../../theme/ThemeProvider';
import type { RevenueDay } from '../../types';
import { formatMoney, parseDate } from '../../utils';
import Notice from '../Notice';
import Panel from '../Panel';
import Txt from '../Txt';
import LineChart from './LineChart';
import type { Point } from './LineChart';

const compact = (v: number) => (v >= 100_000 ? `${Math.round(v / 1000)}к` : String(Math.round(v)));

export default function RevenueChart() {
  const { c } = useTheme();
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<RevenueDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Point | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setSel(null);
    api.get<RevenueDay[]>('/analytics/revenue', { params: { days } })
      .then(({ data: r }) => { if (live) { setData(Array.isArray(r) ? r : []); setError(null); } })
      .catch((e: unknown) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [days]);

  const total = useMemo(() => data.reduce((s, d) => s + d.revenue, 0), [data]);
  const orders = useMemo(() => data.reduce((s, d) => s + d.orders, 0), [data]);
  const points: Point[] = data.map((d) => {
    const dt = parseDate(d.date + 'T12:00:00');
    return { label: `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`, value: d.revenue };
  });

  return (
    <Panel>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.statusDot.green }} />
            <Txt w="medium" size={14} c="soft">Выручка</Txt>
          </View>
          <Txt w="semi" size={26} c="strong" style={{ marginTop: 4, lineHeight: 32 }}>{formatMoney(total)}</Txt>
          <Txt size={12} c="muted" style={{ marginTop: 2 }}>По успешным заказам · {days} дней</Txt>
        </View>
        <View style={{ flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.inset, padding: 3 }}>
          {([7, 30] as const).map((v) => (
            <Pressable key={v} onPress={() => setDays(v)} style={{ borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: days === v ? 'rgba(52,211,153,0.16)' : 'transparent' }}>
              <Txt w="medium" size={12} c={days === v ? c.statusDot.green : 'muted'}>{v} дн.</Txt>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        {error ? <Notice kind="error">{error}</Notice> : loading ? (
          <View style={{ height: 210, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.accentText} /></View>
        ) : (
          <LineChart points={points} color={c.statusDot.green} fmt={compact} labelEvery={days === 7 ? 1 : 5} gradientId="rev" onSelect={setSel} />
        )}
      </View>
      {sel && <Txt size={13} c="soft" align="center" style={{ marginTop: 4 }}>{sel.label}: <Txt w="semi" size={13} c="strong">{formatMoney(sel.value)}</Txt></Txt>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {[['Успешных заказов', String(orders)], ['Средний чек', formatMoney(Math.round(total / Math.max(1, orders)))]].map(([l, v]) => (
          <View key={l} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.inset, padding: 12 }}>
            <Txt size={11} c="muted">{l}</Txt>
            <Txt w="semi" size={17} c="strong" numberOfLines={1} style={{ marginTop: 3 }}>{v}</Txt>
          </View>
        ))}
      </View>
    </Panel>
  );
}
