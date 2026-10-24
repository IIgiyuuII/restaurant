import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { expiryInfo } from '../utils';
import type { Tone } from '../utils';
import Txt from './Txt';

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: string }) {
  const { c } = useTheme();
  const t = c.tones[tone];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Txt w="medium" size={12} c={t.color}>{children}</Txt>
    </View>
  );
}

/** Цветной бейдж «сколько осталось до конца срока годности». */
export default function ExpiryBadge({ expiry }: { expiry: string | null }) {
  const info = expiryInfo(expiry);
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

/** Красный счётчик у пункта меню. */
export function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: 'rgba(239,68,68,0.9)', alignItems: 'center', justifyContent: 'center' }}>
      <Txt w="medium" size={11} c="#fff" style={{ lineHeight: 14 }}>{n > 99 ? '99+' : String(n)}</Txt>
    </View>
  );
}
