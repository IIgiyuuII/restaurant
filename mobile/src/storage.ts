import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* хранилище недоступно — работаем без сохранения */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const KEYS = {
  theme: 'theme.mode',
  apiUrl: 'api.url',
  notifPrefs: 'notif.prefs',
  notifSnapshot: 'notif.snapshot',
  onboarded: 'onboarding.done',
} as const;
