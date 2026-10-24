import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';
import Txt from '../Txt';

export type DonutSlice = { label: string; value: number };
type Props = {
  slices: DonutSlice[];
  centerValue: string | number;
  centerLabel: string;
  formatValue?: (v: number) => string;
  maxSlices?: number;
};

const SIZE = 200, C = 100, R = 72, STROKE = 26, CIRC = 2 * Math.PI * R, GAP = 2.5;

/** Кольцевая диаграмма: тап по сектору или строке легенды подсвечивает его. */
export default function DonutChart({ slices, centerValue, centerLabel, formatValue = String, maxSlices = 6 }: Props) {
  const { c } = useTheme();
  const [active, setActive] = useState<number | null>(null);

  const data = useMemo(() => {
    const sorted = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= maxSlices) return sorted;
    const head = sorted.slice(0, maxSlices - 1);
    const rest = sorted.slice(maxSlices - 1);
    return [...head, { label: 'Остальные', value: rest.reduce((s, r) => s + r.value, 0) }];
  }, [slices, maxSlices]);

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  const color = (i: number) => (data[i].label === 'Остальные' && data.length === maxSlices ? c.chartOther : c.chart[i % c.chart.length]);
  const gap = data.length > 1 ? GAP : 0;
  const shown = active !== null ? data[active] : null;
  let acc = 0;

  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <View style={{ width: 190, height: 190 }}>
        <Svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={190} height={190}>
          <Circle cx={C} cy={C} r={R} fill="none" strokeWidth={STROKE} stroke={c.border} />
          <G rotation={-90} originX={C} originY={C}>
            {data.map((d, i) => {
              const len = (d.value / total) * CIRC;
              const off = acc;
              acc += len;
              return (
                <Circle key={d.label} cx={C} cy={C} r={R} fill="none" stroke={color(i)}
                  strokeWidth={active === i ? STROKE + 6 : STROKE}
                  strokeDasharray={`${Math.max(len - gap, 0.5)} ${CIRC}`} strokeDashoffset={-off}
                  opacity={active === null || active === i ? 1 : 0.35}
                  onPress={() => setActive(active === i ? null : i)} />
              );
            })}
          </G>
        </Svg>
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Txt w="semi" size={shown ? 20 : 30} c="strong" style={{ lineHeight: shown ? 24 : 34 }}>{shown ? formatValue(shown.value) : String(centerValue)}</Txt>
          <Txt size={11} c="muted" align="center" numberOfLines={2}>
            {shown ? `${shown.label.length > 16 ? shown.label.slice(0, 15) + '…' : shown.label} · ${Math.round((shown.value / total) * 100)}%` : centerLabel}
          </Txt>
        </View>
      </View>
      <View style={{ alignSelf: 'stretch', gap: 2 }}>
        {data.map((d, i) => (
          <Pressable key={d.label} onPress={() => setActive(active === i ? null : i)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10, backgroundColor: active === i ? c.hover : 'transparent' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color(i) }} />
            <Txt size={14} c="body" style={{ flex: 1 }} numberOfLines={1}>{d.label}</Txt>
            <Txt mono size={13} c="muted">{formatValue(d.value)}</Txt>
            <Txt size={12} c="faint" style={{ width: 38 }} align="right">{Math.round((d.value / total) * 100)}%</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
