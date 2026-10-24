import { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { checkServer, getApiUrl, isPlaceholderUrl, normalizeApiUrl, setApiUrl } from '../api';
import { CATEGORIES, CATEGORY_INFO } from '../notifications/prefs';
import { useNotifications } from '../notifications/NotificationsProvider';
import type { ThemeMode } from '../theme/palette';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Icon from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import Notice from '../ui/Notice';
import Sheet from '../ui/Sheet';
import Txt from '../ui/Txt';

const THEMES: { id: ThemeMode; label: string; icon: IconName }[] = [
  { id: 'light', label: 'Светлая', icon: 'sun' },
  { id: 'dark', label: 'Тёмная', icon: 'moon' },
  { id: 'system', label: 'Системная', icon: 'monitor' },
];

const Label = ({ children }: { children: string }) => (
  <Txt w="medium" size={11} c="muted" upper tracking={0.8} style={{ marginBottom: 10, marginTop: 6 }}>{children}</Txt>
);

type Props = { visible: boolean; onClose: () => void; onServerChanged: () => void };

export default function SettingsSheet({ visible, onClose, onServerChanged }: Props) {
  const { c, mode, setMode } = useTheme();
  const n = useNotifications();
  const [url, setUrl] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'fail'; text?: string }>({ kind: 'idle' });

  useEffect(() => {
    if (visible) { setUrl(isPlaceholderUrl() ? '' : getApiUrl()); setState({ kind: 'idle' }); }
  }, [visible]);

  const saveServer = async () => {
    const normalized = normalizeApiUrl(url);
    if (!normalized) { setState({ kind: 'fail', text: 'Введите адрес сервера' }); return; }
    setState({ kind: 'busy' });
    const res = await checkServer(normalized);
    if (!res.ok) { setState({ kind: 'fail', text: res.reason }); return; }
    await setApiUrl(normalized);
    setUrl(normalized);
    setState({ kind: 'ok', text: 'Сервер отвечает. Адрес сохранён.' });
    onServerChanged();
  };

  const denied = n.permission === 'denied';
  return (
    <Sheet visible={visible} onClose={onClose} title="Настройки">
      <Label>Тема</Label>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        {THEMES.map((t) => {
          const on = mode === t.id;
          return (
            <Pressable key={t.id} onPress={() => setMode(t.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: on ? c.accent + '88' : c.border, backgroundColor: on ? c.accentSoft : c.inset }}>
              <Icon name={t.icon} size={18} color={on ? c.accentText : c.muted} />
              <Txt w="medium" size={12} c={on ? 'accentText' : 'muted'}>{t.label}</Txt>
            </Pressable>
          );
        })}
      </View>

      <Label>Уведомления</Label>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.inset, paddingHorizontal: 14, marginBottom: 12 }}>
        <Row title="Уведомлять о важном" hint={n.permission === 'granted' ? 'Разрешение выдано' : denied ? 'Запрещено в системных настройках' : 'Нужно разрешение системы'}
          value={n.prefs.enabled && n.permission === 'granted'} onChange={(v) => void n.setEnabled(v)} />
        {CATEGORIES.map((k) => (
          <Row key={k} title={CATEGORY_INFO[k].label} hint={CATEGORY_INFO[k].hint} value={n.prefs[k]} onChange={(v) => n.setCategory(k, v)}
            disabled={!n.prefs.enabled || n.permission !== 'granted'} />
        ))}
      </View>
      {denied && (
        <View style={{ marginBottom: 12 }}>
          <Notice kind="warn" action={<Button label="Открыть настройки телефона" size="sm" variant="outline" onPress={n.openSystemSettings} />}>
            Уведомления отключены для приложения — включите их в системных настройках.
          </Notice>
        </View>
      )}
      {n.permission === 'granted' && n.prefs.enabled && !n.background && (
        <View style={{ marginBottom: 12 }}>
          <Notice kind="info">Фоновые проверки на этом устройстве недоступны: о стоп-листе и закупке сообщим, когда приложение открыто. О сроках годности напомним в любом случае.</Notice>
        </View>
      )}
      <Button label="Отправить тестовое уведомление" variant="soft" icon="bell" onPress={() => void n.sendTest()} full />

      <Label>Сервер</Label>
      <Field value={url} onChangeText={(v) => { setUrl(v); setState({ kind: 'idle' }); }} placeholder="https://ваш-бэкенд.up.railway.app"
        keyboardType="url" hint="Адрес Go-API (не сайта). Допишем /api сами." />
      <View style={{ marginTop: 10, gap: 10 }}>
        {state.kind === 'fail' && <Notice kind="error">{state.text ?? ''}</Notice>}
        {state.kind === 'ok' && <Notice kind="success">{state.text ?? ''}</Notice>}
        <Button label="Проверить и сохранить" icon="server" onPress={() => void saveServer()} loading={state.kind === 'busy'} full />
        <Button label="Сбросить на адрес из сборки" variant="ghost" size="sm" onPress={async () => { await setApiUrl(''); setUrl(''); setState({ kind: 'idle' }); onServerChanged(); }} />
      </View>
    </Sheet>
  );
}

function Row({ title, hint, value, onChange, disabled }: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.divider, opacity: disabled ? 0.45 : 1 }}>
      <View style={{ flex: 1 }}>
        <Txt w="medium" size={14} c="strong">{title}</Txt>
        <Txt size={12} c="muted" style={{ marginTop: 1 }}>{hint}</Txt>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: c.borderStrong, true: c.accent }} thumbColor="#fff" />
    </View>
  );
}
