import axios from 'axios';
import type {
  Batch, Dish, ExpiryReport, HotOffer, OrderHistoryEntry, Product, RestockItem, StopDish,
} from './types';
import { DEFAULT_API_URL } from './config';
import { KEYS, storage } from './storage';

export const api = axios.create({
  baseURL: DEFAULT_API_URL,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

/** Сервер ответил не JSON-ом, а чем-то другим (чаще всего — HTML сайта). */
export class ApiShapeError extends Error {}

/** `example.up.railway.app/` → `https://example.up.railway.app/api` */
export function normalizeApiUrl(raw: string): string {
  let u = raw.trim().replace(/\s+/g, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  u = u.replace(/\/+$/, '');
  if (!/\/api$/i.test(u)) u += '/api';
  return u;
}

const rootOf = (apiUrl: string) => apiUrl.replace(/\/api$/i, '');

export const getApiUrl = (): string => api.defaults.baseURL ?? DEFAULT_API_URL;

/** Адрес не настроен: заглушка из eas.json или localhost на реальном телефоне. */
export function isPlaceholderUrl(url = getApiUrl()): boolean {
  return /REPLACE|YOUR-BACKEND|example\.com/i.test(url) || /\/\/(localhost|127\.0\.0\.1)/i.test(url);
}

let ready: Promise<void> | null = null;
/** Подгружает сохранённый адрес. Безопасно вызывать много раз (и из фоновой задачи). */
export function initApi(): Promise<void> {
  ready ??= (async () => {
    const saved = await storage.get<string | null>(KEYS.apiUrl, null);
    if (saved) api.defaults.baseURL = saved;
  })();
  return ready;
}

export async function setApiUrl(raw: string): Promise<string> {
  const url = normalizeApiUrl(raw);
  if (!url) {
    await storage.remove(KEYS.apiUrl);
    api.defaults.baseURL = DEFAULT_API_URL;
    return DEFAULT_API_URL;
  }
  await storage.set(KEYS.apiUrl, url);
  api.defaults.baseURL = url;
  return url;
}

export type ServerCheck = { ok: true } | { ok: false; reason: string };

/** Проверка адреса: GET /health должен вернуть «ok». */
export async function checkServer(apiUrl: string): Promise<ServerCheck> {
  try {
    const res = await axios.get(`${rootOf(apiUrl)}/health`, {
      timeout: 10_000,
      responseType: 'text',
      transformResponse: (d) => d,
      validateStatus: () => true,
    });
    const body = String(res.data ?? '').trim();
    if (/^\s*<(!doctype|html)/i.test(body)) {
      return {
        ok: false,
        reason: 'Это адрес веб-сайта, а не API. Нужен адрес сервиса с Go-бэкендом (в Railway — отдельный сервис).',
      };
    }
    if (res.status === 200 && body === 'ok') return { ok: true };
    if (res.status >= 500) return { ok: false, reason: 'Сервер отвечает, но не видит базу данных (health ≠ ok).' };
    return { ok: false, reason: `Неожиданный ответ сервера (${res.status}).` };
  } catch (e) {
    return { ok: false, reason: errorMessage(e) };
  }
}

/** Человекочитаемое сообщение из ошибки axios / бэкенда ({"error": "..."}). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiShapeError) return e.message;
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string } | undefined;
    if (data && typeof data === 'object' && data.error) return data.error;
    if (e.code === 'ECONNABORTED') return 'Сервер не ответил вовремя';
    if (!e.response) return 'Нет связи с сервером';
    return `Ошибка сервера (${e.response.status})`;
  }
  return e instanceof Error ? e.message : String(e);
}

async function getList<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
  const { data } = await api.get<unknown>(path, { params });
  if (data == null) return [];
  if (!Array.isArray(data)) {
    throw new ApiShapeError(
      typeof data === 'string'
        ? 'Сервер вернул не JSON. Проверьте адрес API в настройках — похоже, указан адрес сайта.'
        : `Неожиданный формат ответа ${path}`,
    );
  }
  return data as T[];
}

export type AppData = {
  products: Product[];
  stoplist: StopDish[];
  batches: Batch[];
  dishes: Dish[];
  history: OrderHistoryEntry[];
  hotOffers: HotOffer[];
  restock: RestockItem[];
  report: ExpiryReport | null;
};

/** Все данные одним пакетом — ровно те же запросы, что делает веб. */
export async function fetchAll(): Promise<AppData> {
  const [products, stoplist, batches, dishes, history, hotOffers, restock, rep] = await Promise.all([
    getList<Product>('/products'),
    getList<StopDish>('/stoplist'),
    getList<Batch>('/batches'),
    getList<Dish>('/dishes'),
    getList<OrderHistoryEntry>('/orders'),
    getList<HotOffer>('/hot-offers'),
    getList<RestockItem>('/restock'),
    api.get<ExpiryReport>('/writeoffs', { params: { days: 30 } }),
  ]);
  const report = rep.data && typeof rep.data === 'object' && 'by_product' in rep.data ? rep.data : null;
  return { products, stoplist, batches, dishes, history, hotOffers, restock, report };
}
