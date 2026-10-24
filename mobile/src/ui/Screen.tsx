import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

type RefreshCtx = { refreshing: boolean; onRefresh: () => void };
const Ctx = createContext<RefreshCtx>({ refreshing: false, onRefresh: () => {} });
export const RefreshProvider = Ctx.Provider;

type Props = {
  children: ReactNode;
  /** Липкая верхняя плашка (например, итог корзины). */
  sticky?: ReactNode;
  gap?: number;
};

/** Прокручиваемый экран с pull-to-refresh: общий каркас всех разделов. */
export default function Screen({ children, sticky, gap = 24 }: Props) {
  const { c } = useTheme();
  const { refreshing, onRefresh } = useContext(Ctx);
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 + insets.bottom }}
      stickyHeaderIndices={sticky ? [0] : undefined}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accentText} colors={[c.accent]} progressBackgroundColor={c.popover} />}
    >
      {sticky ? <View>{sticky}</View> : <View />}
      <View style={{ gap, paddingTop: 12 }}>{children}</View>
    </ScrollView>
  );
}
