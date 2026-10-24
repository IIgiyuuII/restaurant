import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { errorMessage, fetchAll, initApi } from '../api';
import type { AppData } from '../api';
import { POLL_MS } from '../config';
import { processData } from '../notifications/engine';

/**
 * Данные склада: опрос раз в 10 с, пока приложение на экране (в фоне — паузa, экономим батарею;
 * фоновые проверки делает задача из notifications/background.ts).
 * Каждый успешный ответ отдаём движку уведомлений.
 */
export function useData() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      await initApi();
      const d = await fetchAll();
      if (!alive.current) return;
      setData(d);
      setError(null);
      void processData(d);
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    let timer: ReturnType<typeof setInterval> | null = setInterval(() => void refresh(), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (timer) clearInterval(timer);
      timer = null;
      if (s === 'active') {
        void refresh();
        timer = setInterval(() => void refresh(), POLL_MS);
      }
    });
    return () => {
      alive.current = false;
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  const pull = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return { data, error, setError, refresh, pull, refreshing };
}
