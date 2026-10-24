import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { AppData } from '../api';
import { useNotifications } from '../notifications/NotificationsProvider';
import type { TabId } from '../notifications/events';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../ui/Button';
import Card, { Empty } from '../ui/Card';
import DonutChart from '../ui/charts/DonutChart';
import LineChart from '../ui/charts/LineChart';
import RevenueChart from '../ui/charts/RevenueChart';
import Icon from '../ui/Icon';
import Notice from '../ui/Notice';
import Panel from '../ui/Panel';
import ProgressBar from '../ui/ProgressBar';
import Screen from '../ui/Screen';
import StatCard from '../ui/StatCard';
import Txt from '../ui/Txt';
import { hoursUntil, parseDate } from '../utils';

type Props = { data: AppData; onNavigate: (t: TabId) => void };

const day = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function DashboardScreen({ data, onNavigate }: Props) {
  const { c } = useTheme();
  const notif = useNotifications();
  const [days, setDays] = useState<7 | 30>(7);
  const { products, stoplist, batches, history, restock, report } = data;
  const emptyProducts = products.filter((p) => p.quantity === 0).length;

  const expiry = useMemo(() => {
    const r = { overdue: 0, within24: 0, within72: 0, safe: 0 };
    for (const b of batches) {
      const h = hoursUntil(b.expires_at);
      if (h <= 0) r.overdue++; else if (h <= 24) r.within24++; else if (h <= 72) r.within72++; else r.safe++;
    }
    return r;
  }, [batches]);

  const trend = useMemo(() => {
    const now = new Date();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (days - 1 - i));
      const next = d.getTime() + 86_400_000;
      const total = history.filter((o) => { const t = parseDate(o.created_at).getTime(); return t >= d.getTime() && t < next; }).length;
      return { label: day(d), value: total };
    });
  }, [history, days]);

  const topDishes = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of history) if (o.status === 'created') for (const it of o.items ?? []) m.set(it.name, (m.get(it.name) ?? 0) + it.quantity);
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [history]);
  const topMax = Math.max(1, ...topDishes.map((d) => d.value));

  const lowStock = restock.slice().sort((a, b) => b.suggested_quantity - a.suggested_quantity).slice(0, 6);
  const stockSlices = [
    { label: 'С запасом', value: Math.max(0, products.length - restock.length) },
    { label: 'Мало', value: restock.filter((r) => r.status === 'low').length },
    { label: 'Нет', value: restock.filter((r) => r.status === 'out').length },
  ];
  const risk = expiry.overdue + expiry.within24;

  const expiryRows = [
    { label: 'Просрочено', value: expiry.overdue, color: c.statusDot.red },
    { label: 'До 24 часов', value: expiry.within24, color: c.statusDot.orange },
    { label: '24–72 часа', value: expiry.within72, color: c.statusDot.yellow },
    { label: 'Больше 3 дней', value: expiry.safe, color: c.statusDot.green },
  ];
  const signals = [
    { label: 'Просроченные партии', value: expiry.overdue, detail: 'Требуют списания', tab: 'writeoffs' as TabId, color: c.statusDot.red },
    { label: 'Позиции без остатка', value: emptyProducts, detail: 'Проверьте поставку', tab: 'delivery' as TabId, color: c.statusDot.orange },
    { label: 'Блюда в стоп-листе', value: stoplist.length, detail: 'Недоступны гостям', tab: 'stoplist' as TabId, color: c.statusDot.yellow },
    { label: 'Рекомендации к закупке', value: restock.length, detail: 'Можно сформировать поставку', tab: 'delivery' as TabId, color: c.statusDot.indigo },
  ];

  const link = (label: string, tab: TabId) => (
    <Pressable onPress={() => onNavigate(tab)} hitSlop={8} style={{ marginTop: 12 }}><Txt w="medium" size={13} c="accentText">{label} →</Txt></Pressable>
  );

  return (
    <Screen>
      {notif.permission !== 'granted' && notif.permission !== 'denied' && (
        <Notice kind="info" action={<Button label="Включить уведомления" size="sm" icon="bell" onPress={() => void notif.requestAccess()} />}>
          Узнавайте о просрочке, стоп-листе и закончившихся продуктах прямо на телефоне.
        </Notice>
      )}

      <View>
        <Txt w="semi" size={11} c="accentText" upper tracking={2}>Операционная аналитика</Txt>
        <Txt w="bold" size={24} c="strong" style={{ marginTop: 4, lineHeight: 30 }}>Состояние ресторана</Txt>
        <Txt size={13} c="muted" style={{ marginTop: 6 }}>Склад, доступность меню, заказы и потери — ключевые сигналы для ежедневных решений.</Txt>
      </View>

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatCard label="Продуктов" value={products.length} hint="учётных позиций" accent="indigo" icon="box" onPress={() => onNavigate('stock')} />
          <StatCard label="Нет в наличии" value={emptyProducts} hint="нулевой остаток" accent={emptyProducts ? 'red' : 'green'} icon="ban" onPress={() => onNavigate('stock')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatCard label="Риск срока" value={risk} hint={`${expiry.overdue} просрочено · ${expiry.within24} за 24 ч`} accent={risk ? 'orange' : 'green'} icon="clock" onPress={() => onNavigate('writeoffs')} />
          <StatCard label="В стоп-листе" value={stoplist.length} hint="недоступны к заказу" accent={stoplist.length ? 'yellow' : 'green'} icon="flame" onPress={() => onNavigate('stoplist')} />
        </View>
      </View>

      <RevenueChart />

      <Card title="Динамика заказов" subtitle={`Количество заказов по дням · ${days} дней`}>
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.inset, padding: 3, marginBottom: 10 }}>
          {([7, 30] as const).map((v) => (
            <Pressable key={v} onPress={() => setDays(v)} style={{ borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: days === v ? c.accent : 'transparent' }}>
              <Txt w="medium" size={12} c={days === v ? '#fff' : 'muted'}>{v} дней</Txt>
            </Pressable>
          ))}
        </View>
        {history.length === 0 ? <Empty>Заказы появятся здесь после первых операций.</Empty>
          : <LineChart points={trend} color={c.statusDot.indigo} labelEvery={days === 7 ? 1 : 5} gradientId="ord" />}
        <Txt size={11} c="faint" style={{ marginTop: 6 }}>Считаем по последним заказам, которые отдаёт API.</Txt>
      </Card>

      <Card title="Сроки годности партий" subtitle="Раннее предупреждение помогает использовать продукты до потерь.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {expiryRows.map((r) => (
            <View key={r.label} style={{ width: '48.5%', borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.inset, padding: 12 }}>
              <Txt size={12} c="muted">{r.label}</Txt>
              <Txt w="semi" size={24} c={r.color} style={{ marginTop: 4, lineHeight: 30 }}>{String(r.value)}</Txt>
            </View>
          ))}
        </View>
        <View style={{ gap: 10 }}>
          {expiryRows.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt size={12} c="muted" style={{ width: 98 }}>{r.label}</Txt>
              <View style={{ flex: 1 }}><ProgressBar pct={batches.length ? (r.value / batches.length) * 100 : 0} color={r.color} height={8} /></View>
              <Txt mono size={12} c="soft" style={{ width: 26 }} align="right">{r.value}</Txt>
            </View>
          ))}
        </View>
        {link('Открыть списания', 'writeoffs')}
      </Card>

      <Card title="Состояние запасов" subtitle="Доля позиций с достаточным остатком и требующих пополнения.">
        {products.length ? <DonutChart slices={stockSlices} centerValue={products.length} centerLabel="продуктов" formatValue={(v) => `${v} поз.`} /> : <Empty>Нет данных об остатках.</Empty>}
        {restock.length > 0 && link(`Перейти к пополнению (${restock.length})`, 'delivery')}
      </Card>

      <Card title="Самые востребованные блюда" subtitle="Порции в успешных заказах из загруженной истории.">
        {topDishes.length === 0 ? <Empty>Пока недостаточно данных для диаграммы.</Empty> : (
          <View style={{ gap: 12 }}>
            {topDishes.map((d) => (
              <View key={d.label} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Txt size={13} c="body" numberOfLines={1} style={{ flex: 1 }}>{d.label}</Txt>
                  <Txt mono size={12} c="muted">{d.value}</Txt>
                </View>
                <ProgressBar pct={(d.value / topMax) * 100} color={c.statusDot.indigo} height={8} />
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card title="Что нужно пополнить" subtitle="Шкала — остаток относительно минимального запаса.">
        {lowStock.length === 0 ? <Empty>Нет критичных позиций. Запасы не требуют срочного пополнения.</Empty> : (
          <View style={{ gap: 12 }}>
            {lowStock.map((r) => {
              const pct = r.status === 'out' ? 0 : (r.quantity / Math.max(1, r.min_stock)) * 100;
              const col = r.status === 'out' ? c.statusDot.red : c.statusDot.yellow;
              return (
                <View key={r.product_id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col }} />
                    <Txt size={13} c="body" numberOfLines={1} style={{ flex: 1 }}>{r.name}</Txt>
                    <Txt size={12} c="muted">{Math.round(pct)}%</Txt>
                  </View>
                  <ProgressBar pct={pct} color={col} height={8} />
                </View>
              );
            })}
          </View>
        )}
        {restock.length > 0 && link('Открыть рекомендации по закупке', 'delivery')}
      </Card>

      <Card title="Списание продуктов" subtitle={`Структура списаний по числу партий за ${report?.days ?? 30} дней.`}>
        {report && report.total_batches > 0
          ? <DonutChart slices={report.by_product.map((i) => ({ label: i.name, value: i.batches }))} centerValue={report.total_batches} centerLabel="партий списано" formatValue={(v) => `${v} парт.`} />
          : <Empty>За отчётный период списаний не было.</Empty>}
        {link('Аналитика списаний', 'writeoffs')}
      </Card>

      <Card title="Операционные сигналы" subtitle="Что требует внимания прямо сейчас.">
        <View style={{ gap: 8 }}>
          {signals.map((s) => (
            <Pressable key={s.label} onPress={() => onNavigate(s.tab)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, backgroundColor: pressed ? c.hover : 'transparent' })}>
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.inset }}>
                <Txt w="bold" size={15} c={s.color}>{String(s.value)}</Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt size={14} c="strong">{s.label}</Txt>
                <Txt size={12} c="muted" style={{ marginTop: 1 }}>{s.detail}</Txt>
              </View>
              <Icon name="arrowUpRight" size={16} color={c.faint} />
            </Pressable>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

