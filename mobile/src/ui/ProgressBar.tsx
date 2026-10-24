import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/** Полоска прогресса с анимацией роста слева направо (как animate-grow-x). */
export default function ProgressBar({ pct, color, height = 6 }: { pct: number; color?: string; height?: number }) {
  const { c } = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  const target = Math.max(0, Math.min(100, pct));
  useEffect(() => {
    Animated.timing(v, { toValue: target, duration: 700, useNativeDriver: false }).start();
  }, [target, v]);
  return (
    <View style={{ height, borderRadius: height, overflow: 'hidden', backgroundColor: c.border }}>
      <Animated.View
        style={{
          height: '100%', borderRadius: height, backgroundColor: color ?? c.accent,
          width: v.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}
