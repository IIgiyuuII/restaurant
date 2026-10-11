type Props = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'emerald' | 'yellow' | 'red' | 'gray';
};

const accents = {
  emerald: 'text-emerald-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  gray: 'text-gray-300',
};

export default function StatCard({ label, value, hint, accent = 'gray' }: Props) {
  return (
    <div className="rounded-xl border border-gray-800 bg-[#0d1220] p-5">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={'mt-2 text-3xl font-semibold ' + accents[accent]}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}