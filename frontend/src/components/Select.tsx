import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../usePresence';
import Icon from './Icons';

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Показывается, пока значение не совпадает ни с одним пунктом. */
  placeholder?: string;
  /** Классы кнопки-триггера (рамка, фон, ширина) — как у обычных полей формы. */
  className?: string;
  id?: string;
  'aria-label'?: string;
};

const GAP = 6;
const MAX_MENU_HEIGHT = 288;
const MIN_MENU_WIDTH = 96;

type Pos = { left: number; width: number; maxHeight: number; flip: boolean; top?: number; bottom?: number };

/**
 * Выпадающий список вместо нативного <select>: плавное открытие/закрытие, подсветка,
 * управление с клавиатуры (стрелки, Home/End, Enter, Esc, набор первых букв).
 * Меню рисуется в портале, поэтому его не обрезают контейнеры с overflow: hidden.
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder,
  className = '',
  id,
  'aria-label': ariaLabel,
}: Props) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const [open, setOpen] = useState(false);
  const mounted = usePresence(open);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<Pos | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const flip = below < 200 && above > below;
    const maxHeight = Math.max(120, Math.min(MAX_MENU_HEIGHT, flip ? above : below));
    const width = Math.max(r.width, MIN_MENU_WIDTH);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos(
      flip
        ? { left, width, maxHeight, flip, bottom: window.innerHeight - r.top + GAP }
        : { left, width, maxHeight, flip, top: r.bottom + GAP },
    );
  }, []);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openMenu = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    place();
    setOpen(true);
  };

  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    close(true);
  };

  // Следим за позицией при прокрутке и ресайзе, пока меню открыто.
  useLayoutEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      place();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  // Клик вне меню закрывает его.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Подсвеченный пункт всегда в зоне видимости.
  useEffect(() => {
    if (!open || active < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, mounted]);

  const move = (delta: number) =>
    setActive((a) => {
      const n = options.length;
      if (n === 0) return -1;
      return a < 0 ? (delta > 0 ? 0 : n - 1) : (a + delta + n) % n;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (active >= 0) choose(active);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        // Набор первых букв — переход к подходящему пункту.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          const t = typed.current;
          t.text = now - t.at > 600 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
          t.at = now;
          const from = t.text.length === 1 ? active + 1 : active;
          const order = [...options.keys()].map((_, k) => (from + k) % options.length);
          const hit = order.find((i) => options[i].label.toLowerCase().startsWith(t.text));
          if (hit !== undefined) setActive(hit);
        }
    }
  };

  const menuStyle: CSSProperties | undefined = pos
    ? {
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
        top: pos.top,
        bottom: pos.bottom,
        ['--menu-dy' as string]: pos.flip ? '6px' : '-6px',
        transformOrigin: pos.flip ? 'bottom' : 'top',
      }
    : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={'flex items-center justify-between gap-2 text-left ' + className}
      >
        <span className={'truncate ' + (selected ? '' : 'text-gray-600')}>{selected?.label ?? placeholder ?? ''}</span>
        <Icon
          name="chevronDown"
          size={16}
          className={'text-gray-500 transition-transform duration-200 ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {mounted &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            data-state={open ? 'open' : 'closed'}
            style={menuStyle}
            className="fixed z-[60] overflow-y-auto rounded-xl border border-gray-700 bg-popover p-1 shadow-xl shadow-black/20 backdrop-blur-xl data-[state=closed]:pointer-events-none data-[state=closed]:animate-menu-out data-[state=open]:animate-menu-in"
          >
            {options.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <div
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault() /* не уводим фокус с триггера */}
                  onClick={() => choose(i)}
                  className={
                    'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ' +
                    (i === active ? 'bg-accent-soft ' : '') +
                    (isSelected ? 'font-medium text-accent-text' : 'text-gray-200')
                  }
                >
                  <span className="min-w-0 break-words">{o.label}</span>
                  {isSelected && <Icon name="check" size={15} className="animate-pop-in" />}
                </div>
              );
            })}
            {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">Нет вариантов</div>}
          </div>,
          document.body,
        )}
    </>
  );
}
