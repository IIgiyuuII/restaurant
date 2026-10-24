import { Text } from 'react-native';
import type { TextProps } from 'react-native';
import { fonts, mono } from '../theme/fonts';
import type { Weight } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import type { Colors } from '../theme/palette';

type TextColor = 'strong' | 'body' | 'soft' | 'muted' | 'faint' | 'accentText' | 'onAccent' | 'danger';

type Props = TextProps & {
  w?: Weight;
  size?: number;
  /** Имя токена темы или произвольный цвет. */
  c?: TextColor | (string & {});
  mono?: boolean;
  upper?: boolean;
  tracking?: number;
  align?: 'left' | 'center' | 'right';
};

const TOKENS = new Set<string>(['strong', 'body', 'soft', 'muted', 'faint', 'accentText', 'onAccent', 'danger']);

/** Текст в стиле веба: Inter, цвет из токена темы. */
export default function Txt({ w = 'regular', size = 14, c = 'body', mono: isMono, upper, tracking, align, style, children, ...rest }: Props) {
  const { c: colors } = useTheme();
  const color = TOKENS.has(c) ? (colors[c as keyof Colors] as string) : c;
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: isMono ? mono : fonts[w],
          fontSize: size,
          color,
          lineHeight: Math.round(size * 1.4),
          ...(isMono && w !== 'regular' ? { fontWeight: w === 'bold' ? '700' : '600' } : null),
          ...(upper ? { textTransform: 'uppercase' } : null),
          ...(tracking != null ? { letterSpacing: tracking } : null),
          ...(align ? { textAlign: align } : null),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
