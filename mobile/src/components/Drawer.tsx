import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { CountBadge } from '../ui/Badge';
import Icon from '../ui/Icon';
import Txt from '../ui/Txt';
import type { TabId } from '../notifications/events';
import { NAV } from './nav';

type Props = { open: boolean; active: TabId; onSelect: (t: TabId) => void; onClose: () => void; badges: Partial<Record<TabId, number>> };

const W = 272, ITEM = 40, GAP = 6;

/** Боковое меню — то же, что сайдбар веба: логотип, 7 разделов, красные счётчики. */
export default function Drawer({ open, active, onSelect, onClose, badges }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const a = useRef(new Animated.Value(0)).current;
  const plate = useRef(new Animated.Value(NAV.findIndex((n) => n.id === active))).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(a, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(a, { toValue: 0, duration: 170, useNativeDriver: true }).start(({ finished }) => finished && setMounted(false));
    }
  }, [open, a]);

  useEffect(() => {
    Animated.spring(plate, { toValue: NAV.findIndex((n) => n.id === active), useNativeDriver: true, friction: 8 }).start();
  }, [active, plate]);

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: a }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть меню" />
      </Animated.View>
      <Animated.View style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: W, backgroundColor: c.popover, borderRightWidth: 1, borderRightColor: c.border,
        paddingTop: insets.top, paddingBottom: insets.bottom,
        transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-W, 0] }) }],
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 }}>
          <LinearGradient colors={['#818cf8', '#4f46e5']} style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={22} color="#fff" />
          </LinearGradient>
          <Txt w="bold" size={20} c="strong" style={{ flex: 1 }}>FreshFlow</Txt>
        </View>

        <View style={{ paddingHorizontal: 12, paddingTop: 8, flex: 1 }}>
          <Animated.View style={{
            position: 'absolute', left: 12, right: 12, top: 8, height: ITEM, borderRadius: 12, backgroundColor: c.accentSoft,
            transform: [{ translateY: plate.interpolate({ inputRange: [0, NAV.length], outputRange: [0, NAV.length * (ITEM + GAP)] }) }],
          }} />
          {NAV.map((it) => {
            const on = it.id === active;
            return (
              <Pressable key={it.id} onPress={() => onSelect(it.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={({ pressed }) => ({ height: ITEM, marginBottom: GAP, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, backgroundColor: pressed && !on ? c.hover : 'transparent' })}>
                <Icon name={it.icon} size={20} color={on ? c.accentText : c.muted} />
                <Txt w="medium" size={14} c={on ? 'accentText' : 'muted'} style={{ flex: 1 }}>{it.label}</Txt>
                <CountBadge n={badges[it.id] ?? 0} />
              </Pressable>
            );
          })}
        </View>

      </Animated.View>
    </Modal>
  );
}
