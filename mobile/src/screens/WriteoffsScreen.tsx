import { useState } from 'react';
import { View } from 'react-native';
import { api, errorMessage } from '../api';
import { useTheme } from '../theme/ThemeProvider';
import type { Batch, ExpiryReport, ExpiryWriteOffResult } from '../types';
import Button from '../ui/Button';
import DonutChart from '../ui/charts/DonutChart';
import Icon from '../ui/Icon';
import Notice from '../ui/Notice';
import Panel from '../ui/Panel';
import Screen from '../ui/Screen';
import StatCard from '../ui/StatCard';
import Txt from '../ui/Txt';
import { BATCHES, formatDate, formatQty, overdueLabel, plural } from '../utils';

type Props = { batches: Batch[]; report: ExpiryReport | null; onChanged: () => Promise<void> };

const interval = (m: number) => (m % 60 === 0 ? `${m / 60} ч` : `${m} мин`);

export default function WriteoffsScreen({ batches, report, onChanged }: Props) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = batches.filter((b) => b.expired);

  const writeOff = async (ids?: string[]) => {
    if (busy) return;
    setBusy(true); setError(null); setFlash(null);
    try {
      const { data } = await api.post<ExpiryWriteOffResult>('/writeoffs', ids ? { batch_ids: ids } : {});
      setFlash(data.written_off > 0 ? `Списано: ${data.written_off} ${plural(data.written_off, BATCHES)}` : 'Списывать нечего — партии уже списаны');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); await onChanged(); }
  };
  const top = report?.by_product[0];

  return (
    <Screen gap={22}>
      {report && (
        <Panel style={{ flexDirection: 'row', gap: 10, paddingVertical: 12 }}>
          <Icon name="clock" size={18} color={c.accentText} />
          <Txt size={13} c="muted" style={{ flex: 1 }}>
            {report.auto_check_minutes > 0
              ? `Сервер сам списывает просрочку раз в ${interval(report.auto_check_minutes)}. Здесь это можно сделать сразу.`
              : 'Автосписание выключено — просроченные партии списываются только вручную.'}
          </Txt>
        </Panel>
      )}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt w="semi" size={16} c="strong">К списанию</Txt>
          {pending.length > 1 && <Button label={busy ? 'Списываем…' : `Списать всё (${pending.length})`} variant="danger" size="sm" disabled={busy} onPress={() => void writeOff()} />}
        </View>
        {flash && <Notice kind="success">{flash}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {pending.length === 0 ? <Notice kind="success">Просроченных партий нет</Notice> : pending.map((b) => (
          <Panel key={b.id} tint={{ bg: 'rgba(127,29,29,0.12)', border: c.tones.red.border + '88' }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10 }}>
                <Txt size={15} c="strong">{b.product}</Txt>
                <Txt mono size={13} c="soft">{formatQty(b.remaining_quantity, b.unit)}</Txt>
              </View>
              <Txt size={12} c="muted"><Txt mono size={12} c="muted">{b.delivery_number}</Txt> · срок вышел <Txt size={12} c={c.tones.red.color}>{formatDate(b.expires_at)}</Txt> · {overdueLabel(b.expires_at)}</Txt>
            </View>
            <Button label="Списать" size="sm" variant="outline" disabled={busy} onPress={() => void writeOff([b.id])} />
          </Panel>
        ))}
      </View>

      <View style={{ gap: 12 }}>
        <Txt w="semi" size={16} c="strong">Аналитика списаний{report ? ` · за ${report.days} дн.` : ''}</Txt>
        {!report ? <Txt c="muted">Загрузка…</Txt> : report.total_batches === 0 ? (
          <Panel><Txt c="muted">За {report.days} дн. списаний не было — данные появятся после первого списания.</Txt></Panel>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard label="Списано партий" value={report.total_batches} accent="red" icon="trash" />
              <StatCard label="Продуктов" value={report.by_product.length} accent="yellow" icon="box" />
            </View>
            {top && <StatCard label="Больше всего теряем" value={top.name} hint={`${top.batches} ${plural(top.batches, BATCHES)} · ${formatQty(top.quantity, top.unit)}`} accent="neutral" icon="flame" />}
            <Panel>
              <Txt w="medium" size={11} c="muted" upper tracking={0.6} style={{ marginBottom: 14 }}>Доля продуктов в списаниях</Txt>
              <DonutChart slices={report.by_product.map((s) => ({ label: s.name, value: s.batches }))} centerValue={report.total_batches}
                centerLabel={plural(report.total_batches, BATCHES)} formatValue={(v) => `${v} ${plural(v, BATCHES)}`} />
            </Panel>
            <Panel padded={false}>
              {report.by_product.map((s, i) => (
                <View key={s.product_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.divider }}>
                  <Txt size={14} c="body" style={{ flex: 1 }}>{s.name}</Txt>
                  <Txt size={12} c="muted">{s.batches} парт.</Txt>
                  <Txt mono size={13} c="strong">{formatQty(s.quantity, s.unit)}</Txt>
                </View>
              ))}
            </Panel>
          </>
        )}
      </View>

      {report && report.recent.length > 0 && (
        <View style={{ gap: 10 }}>
          <Txt w="semi" size={16} c="strong">Последние списания</Txt>
          <Panel padded={false}>
            {report.recent.map((r, i) => (
              <View key={r.id} style={{ padding: 14, gap: 3, borderTopWidth: i ? 1 : 0, borderTopColor: c.divider }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Txt size={14} c="strong" style={{ flex: 1 }}>{r.product}</Txt>
                  <Txt mono size={13} c="strong">{formatQty(r.quantity, r.unit)}</Txt>
                </View>
                <Txt size={12} c="muted">списано {formatDate(r.created_at)} · <Txt mono size={12} c="muted">{r.delivery_number}</Txt> · срок вышел {formatDate(r.expires_at)}</Txt>
              </View>
            ))}
          </Panel>
        </View>
      )}
    </Screen>
  );
}
