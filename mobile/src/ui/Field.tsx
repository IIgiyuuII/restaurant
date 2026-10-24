import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { KeyboardTypeOptions, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/fonts';
import Txt from './Txt';

type Props = {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  error?: string;
  suffix?: string;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences';
  style?: StyleProp<ViewStyle>;
  hint?: string;
};

export const FieldLabel = ({ children }: { children: string }) => (
  <Txt w="medium" size={11} c="muted" upper tracking={0.6} style={{ marginBottom: 6 }}>{children}</Txt>
);

/** Поле ввода в стиле веба: полупрозрачный фон, акцентная рамка в фокусе, красная — при ошибке. */
export default function Field({ label, value, onChangeText, placeholder, keyboardType, error, suffix, maxLength, autoCapitalize = 'none', style, hint }: Props) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={style}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.faint}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            fontFamily: fonts.regular, fontSize: 15, color: c.strong,
            backgroundColor: c.field, borderRadius: 12, borderWidth: 1,
            borderColor: error ? c.danger : focus ? c.accent : c.borderStrong,
            paddingHorizontal: 14, paddingVertical: 11, paddingRight: suffix ? 46 : 14, minHeight: 44,
          }}
        />
        {suffix ? <Txt size={12} c="muted" style={{ position: 'absolute', right: 14 }}>{suffix}</Txt> : null}
      </View>
      {error ? <Txt size={12} c={c.danger} style={{ marginTop: 4 }}>{error}</Txt> : hint ? <Txt size={12} c="faint" style={{ marginTop: 4 }}>{hint}</Txt> : null}
    </View>
  );
}
