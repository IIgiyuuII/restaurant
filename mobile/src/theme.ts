import { Platform } from 'react-native';

export const colors = {
  bg: '#0b0f19',
  panel: '#0d1220',
  border: '#1f2937',
  text: '#e5e7eb',
  strong: '#f3f4f6',
  soft: '#9ca3af',
  muted: '#6b7280',
  emerald: '#34d399',
  emeraldBtn: '#10b981',
  red: '#f87171',
  yellow: '#facc15',
};

export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export type Tone = 'red' | 'yellow' | 'green' | 'gray';

export const tones: Record<Tone, { color: string; bg: string; border: string }> = {
  red: { color: '#fca5a5', bg: 'rgba(69,10,10,0.6)', border: '#991b1b' },
  yellow: { color: '#fde047', bg: 'rgba(66,32,6,0.6)', border: '#854d0e' },
  green: { color: '#6ee7b7', bg: 'rgba(2,44,34,0.6)', border: '#065f46' },
  gray: { color: '#9ca3af', bg: '#1f2937', border: '#1f2937' },
};

export type Accent = 'emerald' | 'yellow' | 'red' | 'gray';

export const accents: Record<Accent, string> = {
  emerald: colors.emerald,
  yellow: colors.yellow,
  red: colors.red,
  gray: '#d1d5db',
};