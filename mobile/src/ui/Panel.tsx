import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Рамка/фон другого оттенка (успех, ошибка, акцент). */
  tint?: { bg: string; border: string };
  padded?: boolean;
};

/** «Стеклянная» карточка — аналог `bg-surface rounded-2xl border` в вебе. */
export default function Panel({ children, style, tint, padded = true }: Props) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: tint?.bg ?? c.surface,
          borderColor: tint?.border ?? c.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: padded ? 16 : 0,
          shadowColor: c.shadow,
          shadowOpacity: c.mode === 'dark' ? 0.35 : 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
