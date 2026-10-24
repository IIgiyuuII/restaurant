import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './Button';
import Txt from './Txt';

type Props = { visible: boolean; onClose: () => void; title?: string; children: ReactNode };

/** Нижняя шторка. Закрывается тапом по затемнению, крестиком и кнопкой «Назад» на Android. */
export default function Sheet({ visible, onClose, title, children }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(a, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(a, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, a]);

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: a }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <Animated.View
          style={{
            maxHeight: '88%',
            backgroundColor: c.popover,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: c.borderStrong,
            paddingBottom: insets.bottom + 12,
            transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }],
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: c.borderStrong }} />
          </View>
          {title && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
              <Txt w="semi" size={18} c="strong">{title}</Txt>
              <IconButton icon="x" label="Закрыть" onPress={onClose} size={32} />
            </View>
          )}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 12 }}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
