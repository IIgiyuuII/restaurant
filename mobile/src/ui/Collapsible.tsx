import { useState } from 'react';
import { LayoutAnimation, Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import Icon from './Icon';
import Panel from './Panel';
import Txt from './Txt';

/** Раскрывающийся блок с плавной анимацией высоты. */
export default function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Panel style={{ paddingVertical: 14 }}>
      <Pressable
        onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen((v) => !v); }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <Txt size={14} c="soft" style={{ flex: 1 }}>{title}</Txt>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="chevronDown" size={18} color={c.soft} /></View>
      </Pressable>
      {open && <View style={{ paddingTop: 12 }}>{children}</View>}
    </Panel>
  );
}
