import { View } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import Icon from './Icon';
import type { IconName } from './Icon';
import Txt from './Txt';

type Kind = 'success' | 'error' | 'warn' | 'info';
const MAP: Record<Kind, { tone: 'green' | 'red' | 'yellow' | 'gray'; icon: IconName }> = {
  success: { tone: 'green', icon: 'checkCircle' },
  error: { tone: 'red', icon: 'alertTriangle' },
  warn: { tone: 'yellow', icon: 'alertTriangle' },
  info: { tone: 'gray', icon: 'info' },
};

/** Цветная плашка с иконкой: «Стоп-лист пуст», «Списано: 2 партии», ошибка формы. */
export default function Notice({ kind = 'info', children, action }: { kind?: Kind; children: ReactNode; action?: ReactNode }) {
  const { c } = useTheme();
  const t = c.tones[MAP[kind].tone];
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ marginTop: 1 }}><Icon name={MAP[kind].icon} size={18} color={t.color} /></View>
      <View style={{ flex: 1, gap: 8 }}>
        {typeof children === 'string' ? <Txt size={14} c={t.color}>{children}</Txt> : children}
        {action}
      </View>
    </View>
  );
}
