type Props = { title: string; subtitle?: string };

export default function Header({ title, subtitle }: Props) {
  return (
    <header className="border-b border-gray-800 bg-[#0d1220]/80 backdrop-blur px-8 py-5">
      <h1 className="text-xl font-semibold text-gray-100">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </header>
  );
}