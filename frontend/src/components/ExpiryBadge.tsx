import { expiryInfo } from '../utils';

type Props = { expiry: string | null };

/** Цветной бейдж «сколько осталось до конца срока годности». */
export default function ExpiryBadge({ expiry }: Props) {
  const info = expiryInfo(expiry);
  return (
    <span
      className={
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium ' +
        info.bg +
        ' ' +
        info.color
      }
    >
      {info.label}
    </span>
  );
}
