import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Button, { IconButton } from './Button';
import Icon from './Icon';
import Txt from './Txt';

type Props = { message: string; onRetry: () => void; onClose: () => void; onSettings?: () => void };

export default function ErrorBanner({ message, onRetry, onClose, onSettings }: Props) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: c.accent + '55', backgroundColor: c.accentSoft, padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="info" size={18} color="#fff" />
        </View>
        <Txt size={14} c="strong" style={{ flex: 1, paddingTop: 2 }}>Ошибка: {message}</Txt>
        <IconButton icon="x" label="Закрыть" onPress={onClose} size={30} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Повторить" size="sm" icon="refresh" onPress={onRetry} />
        {onSettings && <Button label="Адрес сервера" size="sm" variant="outline" icon="server" onPress={onSettings} />}
      </View>
    </View>
  );
}
