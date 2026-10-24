import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { KEYS, storage } from '../storage';
import { dark, light } from './palette';
import type { Colors, ThemeMode } from './palette';

type Ctx = { mode: ThemeMode; c: Colors; setMode: (m: ThemeMode) => void };

const ThemeContext = createContext<Ctx>({ mode: 'system', c: dark, setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    void storage.get<ThemeMode>(KEYS.theme, 'system').then((m) => {
      if (m === 'light' || m === 'dark' || m === 'system') setModeState(m);
    });
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    void storage.set(KEYS.theme, m);
  }, []);

  // «Как в системе» — отдаём управление ОС; иначе форсируем выбранную схему (в т.ч. для системных диалогов).
  useEffect(() => {
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  }, [mode]);

  const resolved = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
  const value = useMemo<Ctx>(
    () => ({ mode, c: resolved === 'light' ? light : dark, setMode }),
    [mode, resolved, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
