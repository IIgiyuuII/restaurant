import axios from 'axios';

// Адрес бэкенда: VITE_API_URL=https://my-api.example.com/api при деплое,
// локально — порт 8081 из README.
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8081/api';

export const api = axios.create({ baseURL: API_URL, timeout: 15_000 });

/** Человекочитаемое сообщение из ошибки axios / бэкенда ({"error": "..."}). */
export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (!e.response) return 'Нет связи с сервером';
    return `Ошибка сервера (${e.response.status})`;
  }
  return e instanceof Error ? e.message : String(e);
}
