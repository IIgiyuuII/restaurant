import { View } from 'react-native';
import type { ReactNode } from 'react';
import Panel from './Panel';
import Txt from './Txt';

/** Панель с заголовком и подзаголовком (как <Panel/> в веб-дашборде). */
export default function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Panel>
      <View style={{ marginBottom: 14 }}>
        <Txt w="semi" size={14} c="strong">{title}</Txt>
        {subtitle ? <Txt size={12} c="muted" style={{ marginTop: 3 }}>{subtitle}</Txt> : null}
      </View>
      {children}
    </Panel>
  );
}

export function Empty({ children }: { children: string }) {
  return (
    <View style={{ minHeight: 110, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(129,140,248,0.3)', padding: 16 }}>
      <Txt size={13} c="muted" align="center">{children}</Txt>
    </View>
  );
}
