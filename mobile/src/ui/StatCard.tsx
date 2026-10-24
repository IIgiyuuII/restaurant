import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Icon from './Icon';
import type { IconName } from './Icon';
import Txt from './Txt';

export type StatAccent = 'neutral' | 'indigo' | 'orange' | 'green' | 'red' | 'yellow';

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: StatAccent;
  icon?: IconName;
  onPress?: () => void;
};

// rgb-тройки: в светлой теме веб подменяет red/yellow/emerald на более тёмные оттенки.
const RGB = {
  dark: { indigo: '129,140,248', orange: '251,146,60', green: '52,211,153', red: '248,113,113', yellow: '250,204,21' },
  light: { indigo: '99,102,241', orange: '234,88,12', green: '5,150,105', red: '220,38,38', yellow: '217,119,6' },
};
const ICON = {
  dark: { indigo: '#a5b4fc', orange: '#fb923c', green: '#34d399', red: '#f87171', yellow: '#facc15' },
  light: { indigo: '#4338ca', orange: '#c2410c', green: '#059669', red: '#dc2626', yellow: '#b45309' },
};

/** Плавно «досчитывает» число до нового значения (при монтировании — от 0). */
function useCountUp(target: number, ms = 700) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = Date.now();
    const a = from.current;
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / ms);
      const v = Math.round(a + (target - a) * (1 - Math.pow(1 - p, 3)));
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

export default function StatCard({ label, value, hint, accent = 'neutral', icon, onPress }: Props) {
  const { c } = useTheme();
  const counted = useCountUp(typeof value === 'number' ? value : 0);
  const display = typeof value === 'number' ? counted : value;

  const isNeutral = accent === 'neutral';
  const rgb = !isNeutral ? RGB[c.mode][accent] : '';
  const cardBg = isNeutral ? c.surface : `rgba(${rgb},${accent === 'indigo' || accent === 'orange' ? 0.15 : 0.1})`;
  const cardBorder = isNeutral ? c.border : `rgba(${rgb},${accent === 'indigo' || accent === 'orange' ? 0.35 : 0.28})`;
  const chipBg = isNeutral ? c.accentSoft : `rgba(${rgb},0.22)`;
  const chipFg = isNeutral ? c.accentText : ICON[c.mode][accent];

  const body = (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {icon ? (
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: chipBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={20} color={chipFg} />
          </View>
        ) : <View />}
        {onPress && <Icon name="arrowRight" size={16} color={c.muted} />}
      </View>
      <Txt w="medium" size={11} c="muted" upper tracking={0.8} style={{ marginTop: 18 }}>{label}</Txt>
      <Txt w="bold" size={30} c="strong" style={{ marginTop: 4, lineHeight: 36 }} numberOfLines={2} adjustsFontSizeToFit>
        {String(display)}
      </Txt>
      {hint ? <Txt size={12} c="muted" style={{ marginTop: 3 }}>{hint}</Txt> : null}
    </>
  );

  const style = { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: cardBorder, backgroundColor: cardBg, padding: 16 } as const;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [style, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>{body}</Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}
