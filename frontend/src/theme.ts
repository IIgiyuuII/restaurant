import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'theme';

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* localStorage недоступен — работаем без сохранения */
  }
  return 'system';
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Ставит data-theme на <html>. Вызывается до первого рендера, чтобы не было вспышки. */
export function applyTheme(mode: ThemeMode) {
  const resolved = mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = resolved;
}

export function initTheme() {
  applyTheme(readStored());
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readStored);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    applyTheme(next);
  }, []);

  // В режиме «как в системе» следим за сменой системной темы.
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode;
  return { mode, resolved, setMode };
}
