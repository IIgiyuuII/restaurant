import { expiryInfo } from '../utils';
import Pill from './Pill';

export default function ExpiryBadge({ expiry }: { expiry: string | null }) {
  const info = expiryInfo(expiry);
  return <Pill label={info.label} tone={info.tone} />;
}