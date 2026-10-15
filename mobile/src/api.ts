import axios from 'axios';

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8081/api';

export const api = axios.create({ baseURL: API_URL, timeout: 15_000 });

export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (!e.response) return 'Нет связи с сервером';
    return `Ошибка сервера (${e.response.status})`;
  }
  return e instanceof Error ? e.message : String(e);
}