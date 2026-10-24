import type { Tone } from '../utils';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ToneColors = { color: string; bg: string; border: string };

export type Colors = {
  mode: 'light' | 'dark';
  /** Базовый цвет страницы и два «свечения» (как --page-bg в вебе). */
  page: { base: string; glowA: string; glowB: string };
  waveA: string;
  waveB: string;
  surface: string;
  inset: string;
  hover: string;
  field: string;
  popover: string;
  scrim: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentText: string;
  onAccent: string;
  /** Шкала текста: от самого контрастного к самому тихому. */
  strong: string;
  body: string;
  soft: string;
  muted: string;
  faint: string;
  border: string;
  borderStrong: string;
  divider: string;
  danger: string;
  tones: Record<Tone, ToneColors>;
  /** Круговые диаграммы и полосы. */
  chart: string[];
  chartOther: string;
  statusDot: { red: string; orange: string; yellow: string; green: string; indigo: string };
  shadow: string;
};

// Значения взяты из токенов веба (frontend/src/index.css): тёмная и светлая темы.
export const dark: Colors = {
  mode: 'dark',
  page: { base: '#090c24', glowA: 'rgba(99,102,241,0.20)', glowB: 'rgba(79,70,229,0.22)' },
  waveA: 'rgba(99,102,241,0.22)',
  waveB: 'rgba(129,140,248,0.05)',
  surface: 'rgba(24,28,72,0.55)',
  inset: 'rgba(6,8,30,0.40)',
  hover: 'rgba(129,140,248,0.10)',
  field: 'rgba(6,8,30,0.55)',
  popover: '#16193f',
  scrim: 'rgba(3,4,16,0.62)',
  accent: '#6366f1',
  accentHover: '#7c7ff7',
  accentSoft: 'rgba(99,102,241,0.18)',
  accentText: '#a5b4fc',
  onAccent: '#ffffff',
  strong: '#e9ebff',
  body: '#d3d6f5',
  soft: '#b4b9e3',
  muted: '#8d93c4',
  faint: '#555c8f',
  border: 'rgba(129,140,248,0.16)',
  borderStrong: 'rgba(129,140,248,0.28)',
  divider: 'rgba(129,140,248,0.10)',
  danger: '#ef4444',
  tones: {
    red: { color: '#fca5a5', bg: 'rgba(69,10,10,0.60)', border: '#991b1b' },
    yellow: { color: '#fde047', bg: 'rgba(66,32,6,0.60)', border: '#854d0e' },
    green: { color: '#6ee7b7', bg: 'rgba(2,44,34,0.60)', border: '#065f46' },
    gray: { color: '#8d93c4', bg: 'rgba(129,140,248,0.16)', border: 'rgba(129,140,248,0.16)' },
  },
  chart: ['#6366f1', '#f59e0b', '#f43f5e', '#38bdf8', '#a78bfa', '#ec4899', '#14b8a6', '#fb923c'],
  chartOther: '#6b7280',
  statusDot: { red: '#fb7185', orange: '#fb923c', yellow: '#fbbf24', green: '#34d399', indigo: '#818cf8' },
  shadow: '#000000',
};

export const light: Colors = {
  mode: 'light',
  page: { base: '#f3f4fd', glowA: 'rgba(129,140,248,0.20)', glowB: 'rgba(167,139,250,0.18)' },
  waveA: 'rgba(129,140,248,0.20)',
  waveB: 'rgba(167,139,250,0.08)',
  surface: 'rgba(255,255,255,0.72)',
  inset: 'rgba(99,102,241,0.06)',
  hover: 'rgba(99,102,241,0.09)',
  field: 'rgba(255,255,255,0.95)',
  popover: '#ffffff',
  scrim: 'rgba(17,20,47,0.40)',
  accent: '#5b5fe8',
  accentHover: '#4b4fd9',
  accentSoft: 'rgba(99,102,241,0.13)',
  accentText: '#4338ca',
  onAccent: '#ffffff',
  strong: '#181b3a',
  body: '#252a52',
  soft: '#3a4070',
  muted: '#545b8c',
  faint: '#959bbd',
  border: 'rgba(99,102,241,0.16)',
  borderStrong: 'rgba(99,102,241,0.26)',
  divider: 'rgba(99,102,241,0.09)',
  danger: '#dc2626',
  tones: {
    red: { color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
    yellow: { color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
    green: { color: '#047857', bg: '#d1fae5', border: '#6ee7b7' },
    gray: { color: '#545b8c', bg: 'rgba(99,102,241,0.09)', border: 'rgba(99,102,241,0.16)' },
  },
  chart: ['#6366f1', '#f59e0b', '#f43f5e', '#38bdf8', '#a78bfa', '#ec4899', '#14b8a6', '#fb923c'],
  chartOther: '#9ca3af',
  statusDot: { red: '#e11d48', orange: '#ea580c', yellow: '#d97706', green: '#059669', indigo: '#6366f1' },
  shadow: '#4f46e5',
};
