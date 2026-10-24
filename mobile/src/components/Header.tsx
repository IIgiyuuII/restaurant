import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from '../ui/Button';
import Icon from '../ui/Icon';
import Txt from '../ui/Txt';

type Props = { title: string; subtitle?: string; onMenu: () => void; onSettings: () => void; alert?: boolean; menuAlert?: boolean };

export default function Header({ title, subtitle, onMenu, onSettings, alert, menuAlert }: Props) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
      <View>
        <IconButton icon="menu" label="Открыть меню" onPress={onMenu} />
        {menuAlert && <View style={{ position: 'absolute', right: -2, top: -2, width: 11, height: 11, borderRadius: 6, backgroundColor: c.danger, borderWidth: 2, borderColor: c.page.base }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt w="bold" size={24} c="strong" numberOfLines={1} style={{ lineHeight: 30 }}>{title}</Txt>
        {subtitle ? <Txt size={13} c="muted" numberOfLines={2} style={{ marginTop: 2 }}>{subtitle}</Txt> : null}
      </View>
      <Pressable onPress={onSettings} accessibilityRole="button" accessibilityLabel="Настройки" hitSlop={6}>
        <LinearGradient colors={['#818cf8', '#4f46e5']} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="user" size={19} color="#fff" />
        </LinearGradient>
        {alert && <View style={{ position: 'absolute', right: 0, top: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: c.danger, borderWidth: 2, borderColor: c.page.base }} />}
      </Pressable>
    </View>
  );
}
