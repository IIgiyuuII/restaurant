import type { ReactNode } from 'react';
import Icon from './Icons';
import type { IconName } from './Icons';

type Props = {
  icon?: IconName;
  children: ReactNode;
  /** Ссылка справа («Все предложения →»). */
  action?: { label: string; onClick: () => void };
};

export default function SectionTitle({ icon, children, action }: Props) {
  return (
    <div className="animate-fade-up mb-4 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2.5 text-base font-semibold text-gray-100 sm:text-lg">
        {icon && <Icon name={icon} size={20} className="text-accent-text" />}
        {children}
      </h2>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-accent-text hover:underline sm:text-sm"
        >
          {action.label}
          <Icon name="arrowRight" size={14} />
        </button>
      )}
    </div>
  );
}
