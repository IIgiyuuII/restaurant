import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Icon from './Icon';
import Sheet from './Sheet';
import Txt from './Txt';

export type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  title?: string;
  width?: number;
};

/** Выпадающий список: поле + нижняя шторка со списком (вместо <select> из веба). */
export default function Select({ value, onChange, options, placeholder = 'Выберите…', title, width }: Props) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          width, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          backgroundColor: c.field, borderRadius: 12, borderWidth: 1, borderColor: open ? c.accent : c.borderStrong,
          paddingHorizontal: 14, paddingVertical: 10, opacity: pressed ? 0.8 : 1,
        })}
      >
        <Txt size={15} c={current ? 'strong' : 'faint'} numberOfLines={1} style={{ flexShrink: 1 }}>{current?.label ?? placeholder}</Txt>
        <Icon name="chevronDown" size={16} color={c.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title ?? placeholder}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value || '__empty'}
              onPress={() => { onChange(o.value); setOpen(false); }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, marginBottom: 4,
                backgroundColor: active ? c.accentSoft : pressed ? c.hover : 'transparent',
              })}
            >
              <Txt size={15} c={active ? 'accentText' : 'body'} w={active ? 'medium' : 'regular'} style={{ flex: 1 }}>{o.label}</Txt>
              {active && <View><Icon name="check" size={16} color={c.accentText} /></View>}
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}
