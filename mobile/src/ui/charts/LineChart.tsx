import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Defs, Line, LinearGradient, Polygon, Polyline, Stop, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';

export type Point = { label: string; value: number };

type Props = {
  points: Point[];
  color: string;
  /** Подпись оси Y (формат чисел). */
  fmt?: (v: number) => string;
  /** Показывать подпись по оси X у каждой N-й точки. */
  labelEvery?: number;
  gradientId: string;
  onSelect?: (p: Point | null) => void;
};

/** Линейный график с областью под линией. Тап по точке выбирает её. */
export default function LineChart({ points, color, fmt = (v) => String(Math.round(v)), labelEvery = 1, gradientId, onSelect }: Props) {
  const { c } = useTheme();
  const [w, setW] = useState(320);
  const [sel, setSel] = useState<number | null>(null);
  const h = 210, left = 46, right = 12, top = 14, bottom = 28;
  const cw = w - left - right, ch = h - top - bottom;
  const max = Math.max(1, ...points.map((p) => p.value));
  const xy = points.map((p, i) => ({
    ...p,
    x: left + (points.length <= 1 ? cw / 2 : (i / (points.length - 1)) * cw),
    y: top + ch - (p.value / max) * ch,
  }));
  const line = xy.map((p) => `${p.x},${p.y}`).join(' ');
  const area = xy.length > 1 ? `${left},${top + ch} ${line} ${left + cw},${top + ch}` : '';
  const select = (i: number) => { const n = sel === i ? null : i; setSel(n); onSelect?.(n === null ? null : points[n]); };

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {[0, 0.5, 1].map((r) => (
          <G key={r}>
            <Line x1={left} x2={w - right} y1={top + ch * (1 - r)} y2={top + ch * (1 - r)} stroke={c.muted} strokeOpacity={0.2} strokeDasharray="4 5" />
            <SvgText x={left - 8} y={top + ch * (1 - r) + 4} fontSize="10" fill={c.muted} textAnchor="end">{fmt(max * r)}</SvgText>
          </G>
        ))}
        {area ? <Polygon points={area} fill={`url(#${gradientId})`} /> : null}
        {xy.length > 1 ? <Polyline points={line} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {xy.map((p, i) => (
          <G key={p.label + i}>
            <Circle cx={p.x} cy={p.y} r={sel === i ? 6 : points.length > 12 ? 2.7 : 4} fill={color} stroke={c.popover} strokeWidth={2} />
            <Circle cx={p.x} cy={p.y} r={16} fill="transparent" onPress={() => select(i)} />
            {(i % labelEvery === 0 || i === xy.length - 1) && (
              <SvgText x={p.x} y={h - 8} fontSize="10" fill={c.muted} textAnchor="middle">{p.label}</SvgText>
            )}
          </G>
        ))}
      </Svg>
    </View>
  );
}
