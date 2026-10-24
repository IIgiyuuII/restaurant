/**
 * Адрес бэкенда. Порядок приоритета:
 *  1. адрес, сохранённый в приложении (Настройки → Сервер) — см. api.ts;
 *  2. EXPO_PUBLIC_API_URL, вшитый в сборку (eas.json / .env);
 *  3. продовый бэкенд на Railway (значение по умолчанию ниже).
 *
 * ВАЖНО: это адрес Go-API (…/api), а не адрес веб-сайта.
 */
export const DEFAULT_API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://restaurant-production-2e70.up.railway.app/api';

/** Как часто обновляем данные, пока приложение на экране. */
export const POLL_MS = 10_000;

/** Фоновая проверка уведомлений (минуты). Меньше 15 ОС всё равно не даст. */
export const BACKGROUND_INTERVAL_MIN = 15;

export const APP_VERSION = '1.0.0';
