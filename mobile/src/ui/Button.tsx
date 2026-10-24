import { ActivityIndicator, Pressable, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Icon from './Icon';
import type { IconName } from './Icon';
import Txt from './Txt';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
  full?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Button({ label, onPress, variant = 'primary', icon, loading, disabled, size = 'md', full, style }: Props) {
  const { c } = useTheme();
  const off = disabled || loading;
  const v = {
    primary: { bg: c.accent, fg: c.onAccent, border: 'transparent' },
    danger: { bg: c.danger, fg: '#fff', border: 'transparent' },
    outline: { bg: 'transparent', fg: c.soft, border: c.borderStrong },
    ghost: { bg: 'transparent', fg: c.muted, border: 'transparent' },
    soft: { bg: c.accentSoft, fg: c.accentText, border: c.accent + '55' },
  }[variant];
  const sm = size === 'sm';
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: sm ? 10 : 12,
          borderWidth: 1,
          borderColor: v.border,
          backgroundColor: v.bg,
          paddingHorizontal: sm ? 12 : 20,
          paddingVertical: sm ? 7 : 12,
          minHeight: sm ? 32 : 44,
          opacity: off ? 0.4 : 1,
          transform: [{ scale: pressed && !off ? 0.97 : 1 }],
          ...(variant === 'primary' && !off
            ? { shadowColor: c.accent, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 }
            : null),
        },
        full && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : icon ? <Icon name={icon} size={sm ? 14 : 17} color={v.fg} /> : null}
      <Txt w="medium" size={sm ? 12 : 14} c={v.fg}>{label}</Txt>
    </Pressable>
  );
}

/** Квадратная кнопка-иконка (меню, закрыть, ±). */
export function IconButton({ icon, onPress, label, size = 40, disabled, active }: {
  icon: IconName; onPress: () => void; label: string; size?: number; disabled?: boolean; active?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size > 36 ? 12 : 9,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? c.accentSoft : c.surface,
        borderWidth: 1, borderColor: active ? c.accent + '66' : c.border,
        opacity: disabled ? 0.3 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <View><Icon name={icon} size={size > 36 ? 20 : 16} color={active ? c.accentText : c.soft} /></View>
    </Pressable>
  );
}
