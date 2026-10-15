import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icons';

type Props = { title: string; children: ReactNode };

/** Раскрывающийся блок с плавной анимацией высоты (вместо нативного <details>). */
export default function Collapsible({ title, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="rounded-2xl border border-gray-800 bg-surface px-5 py-3 text-sm text-gray-400">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-3 text-left text-gray-300 hover:text-gray-100"
      >
        {title}
        <Icon name="chevronDown" size={18} className={'transition-transform duration-300 ' + (open ? 'rotate-180' : '')} />
      </button>
      <div
        id={id}
        inert={!open}
        className={
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out ' +
          (open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')
        }
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
