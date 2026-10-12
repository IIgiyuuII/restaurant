import { expiryInfo } from '../utils';

type Props = { expiry: string | null };

/** Цветной бейдж «сколько осталось до конца срока годности». */
export default function ExpiryBadge({ expiry }: Props) {
  const info = expiryInfo(expiry);
  return (
    <span
      className={
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs ' +
        info.bg +
        ' ' +
        info.color
      }
    >
      {info.label}
    </span>
  );
}
