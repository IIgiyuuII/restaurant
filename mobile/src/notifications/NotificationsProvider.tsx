import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { syncBackgroundTask } from './background';
import type { TabId } from './events';
import { ensureChannels, getPermission, present, requestPermission } from './notify';
import type { Permission } from './notify';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from './prefs';
import type { Category, NotifPrefs } from './prefs';

const TABS: TabId[] = ['dashboard', 'stock', 'stoplist', 'hot', 'orders', 'delivery', 'writeoffs'];

type Ctx = {
  prefs: NotifPrefs;
  permission: Permission;
  /** Фоновые проверки доступны (ОС разрешает) — иначе уведомления идут только при открытом приложении. */
  background: boolean;
  setEnabled: (on: boolean) => Promise<void>;
  setCategory: (c: Category, on: boolean) => void;
  requestAccess: () => Promise<void>;
  openSystemSettings: () => void;
  sendTest: () => Promise<void>;
};

const NotificationsContext = createContext<Ctx | null>(null);

export function NotificationsProvider({ onOpenTab, children }: { onOpenTab: (tab: TabId) => void; children: ReactNode }) {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [permission, setPermission] = useState<Permission>('undetermined');
  const [background, setBackground] = useState(false);
  const loaded = useRef(false);

  const applyBackground = useCallback(async (p: NotifPrefs, perm: Permission) => {
    setBackground(await syncBackgroundTask(p.enabled && perm === 'granted'));
  }, []);

  // Старт: настройки, каналы Android, разрешение, фоновая задача.
  useEffect(() => {
    void (async () => {
      const [p] = await Promise.all([loadPrefs(), ensureChannels()]);
      const perm = await getPermission();
      setPrefs(p);
      setPermission(perm);
      loaded.current = true;
      await applyBackground(p, perm);
    })();
  }, [applyBackground]);

  // Пользователь мог поменять разрешение в системных настройках — перепроверяем при возврате в приложение.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && loaded.current) void getPermission().then(setPermission);
    });
    return () => sub.remove();
  }, []);

  // Тап по уведомлению (в т.ч. холодный старт из него) → открыть нужный раздел.
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const tab = last.notification.request.content.data?.tab;
    if (typeof tab === 'string' && (TABS as string[]).includes(tab)) onOpenTab(tab as TabId);
    Notifications.clearLastNotificationResponse();
  }, [last, onOpenTab]);

  const update = useCallback((next: NotifPrefs) => {
    setPrefs(next);
    void savePrefs(next);
  }, []);

  const setEnabled = useCallback(async (on: boolean) => {
    let perm = permission;
    if (on && perm !== 'granted') {
      perm = await requestPermission();
      setPermission(perm);
    }
    const next = { ...prefs, enabled: on };
    update(next);
    await applyBackground(next, perm);
  }, [permission, prefs, update, applyBackground]);

  const requestAccess = useCallback(async () => {
    const perm = await requestPermission();
    setPermission(perm);
    await applyBackground(prefs, perm);
  }, [prefs, applyBackground]);

  const value = useMemo<Ctx>(() => ({
    prefs,
    permission,
    background,
    setEnabled,
    setCategory: (c, on) => update({ ...prefs, [c]: on }),
    requestAccess,
    openSystemSettings: () => void Linking.openSettings(),
    sendTest: async () => {
      if (permission !== 'granted') await requestAccess();
      await present({
        key: `test:${Date.now()}`,
        category: 'orders',
        tab: 'dashboard',
        title: 'Уведомления работают',
        body: 'Так будут выглядеть сигналы о сроках годности, стоп-листе и закупке.',
      });
    },
  }), [prefs, permission, background, setEnabled, update, requestAccess]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): Ctx {
  const v = useContext(NotificationsContext);
  if (!v) throw new Error('useNotifications: нет NotificationsProvider');
  return v;
}
