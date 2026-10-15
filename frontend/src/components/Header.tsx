import { useEffect, useRef, useState } from 'react';
import Icon from './Icons';
import type { IconName } from './Icons';
import { usePresence } from '../usePresence';
import { useTheme } from '../theme';
import type { ThemeMode } from '../theme';

type Props = { title: string; subtitle?: string; onMenu: () => void };

const THEMES: { id: ThemeMode; label: string; icon: IconName }[] = [
  { id: 'light', label: 'Светлая', icon: 'sun' },
  { id: 'dark', label: 'Тёмная', icon: 'moon' },
  { id: 'system', label: 'Как в системе', icon: 'monitor' },
];

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const CHIP =
  'bg-surface flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-2 text-sm text-gray-300';

export default function Header({ title, subtitle, onMenu }: Props) {
  const now = useNow();
  const date = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.$/, '');
  const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <header className="flex items-start gap-3 px-4 pt-5 pb-2 md:px-8 md:pt-8">
      <button
        onClick={onMenu}
        className="bg-surface mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-800 text-gray-300 hover:bg-hover md:hidden"
        aria-label="Открыть меню"
      >
        <Icon name="menu" size={20} />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-100 md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className={CHIP + ' hidden md:flex'}>
          <Icon name="calendar" size={16} className="text-gray-400" />
          {date}
        </div>
        <div className={CHIP + ' hidden sm:flex'}>
          <Icon name="clock" size={16} className="text-gray-400" />
          {time}
        </div>
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const mounted = usePresence(open);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-1.5"
        aria-label="Меню и тема"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-indigo-400 to-indigo-600 text-white shadow-md shadow-indigo-500/30 transition-transform duration-200 group-hover:scale-105">
          <Icon name="user" size={19} />
        </span>
        <span className="bg-surface flex h-9 w-9 items-center justify-center rounded-xl border border-gray-800 text-gray-400 transition-colors group-hover:text-gray-100">
          <Icon name="chevronDown" size={16} className={'transition-transform duration-200 ' + (open ? 'rotate-180' : '')} />
        </span>
      </button>

      {mounted && (
        <div
          role="menu"
          data-state={open ? 'open' : 'closed'}
          className="absolute right-0 top-12 z-50 w-52 origin-top-right overflow-hidden rounded-2xl border border-gray-700 bg-popover p-1.5 shadow-xl shadow-black/20 backdrop-blur-xl data-[state=closed]:pointer-events-none data-[state=closed]:animate-menu-out data-[state=open]:animate-menu-in"
        >
          <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Тема</div>
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="menuitemradio"
              aria-checked={mode === t.id}
              onClick={() => {
                setMode(t.id);
                setOpen(false);
              }}
              className={
                'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ' +
                (mode === t.id ? 'bg-accent-soft text-accent-text' : 'text-gray-300 hover:bg-hover')
              }
            >
              <Icon name={t.icon} size={16} />
              <span className="flex-1 text-left">{t.label}</span>
              {mode === t.id && <Icon name="check" size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
