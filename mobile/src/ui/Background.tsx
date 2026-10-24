import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

/** Фон страницы: базовый цвет + два «свечения» + мягкие волны (как <Background/> в вебе). */
export default function Background() {
  const { c } = useTheme();
  const { width: w, height: h } = useWindowDimensions();
  return (
    <Svg style={StyleSheet.absoluteFill} width={w} height={h} pointerEvents="none">
      <Defs>
        <RadialGradient id="glowA" cx={w * 0.9} cy={-h * 0.08} rx={w * 1.1} ry={h * 0.55} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={c.page.glowA} stopOpacity="1" />
          <Stop offset="0.6" stopColor={c.page.glowA} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="glowB" cx={0} cy={h * 1.08} rx={w * 1.1} ry={h * 0.55} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={c.page.glowB} stopOpacity="1" />
          <Stop offset="0.6" stopColor={c.page.glowB} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={w} height={h} fill={c.page.base} />
      <Rect width={w} height={h} fill="url(#glowA)" />
      <Rect width={w} height={h} fill="url(#glowB)" />
      <G transform={`scale(${w / 1440} ${h / 900})`}>
        <Path d="M-40 560 C 200 440, 360 700, 620 640 C 880 580, 1000 800, 1500 720 L 1500 940 L -40 940 Z" fill={c.waveA} />
        <Path d="M-40 380 C 160 300, 300 460, 520 420 C 760 380, 900 560, 1500 480 L 1500 940 L -40 940 Z" fill={c.waveB} />
        <Path d="M700 -20 C 820 120, 1000 60, 1120 180 C 1240 300, 1360 220, 1480 300 L 1480 -20 Z" fill={c.waveB} />
      </G>
    </Svg>
  );
}
