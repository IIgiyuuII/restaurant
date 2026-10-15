import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../usePresence';
import Icon from './Icons';

type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Красная кнопка подтверждения — для необратимых действий. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Анимированное окно подтверждения вместо нативного window.confirm. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const mounted = usePresence(open, 180);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Фокус — на «Отмена» при открытии, и возврат на прежний элемент при закрытии.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => prev?.focus?.();
  }, [open]);

  if (!mounted) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Tab') {
      // Фокус не выходит за пределы окна: цикл между двумя кнопками.
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  const state = open ? 'open' : 'closed';

  return createPortal(
    <div
      data-state={state}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        data-state={state}
        className="w-full max-w-sm rounded-2xl border border-gray-700 bg-popover p-5 shadow-2xl data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in"
      >
        <div className="flex items-start gap-3">
          <span
            className={
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' +
              (danger ? 'bg-red-400/20 text-red-400' : 'bg-accent-soft text-accent-text')
            }
          >
            <Icon name="alertTriangle" size={20} />
          </span>
          <div className="min-w-0">
            <h3 id="confirm-title" className="text-base font-semibold text-gray-100">
              {title}
            </h3>
            {message && <p className="mt-1 text-sm text-gray-400">{message}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:bg-hover"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={
              'rounded-lg px-4 py-2 text-sm font-medium text-white shadow-md ' +
              (danger
                ? 'bg-red-500 shadow-red-500/25 hover:bg-red-400'
                : 'bg-accent shadow-indigo-500/25 hover:bg-accent-hover')
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
