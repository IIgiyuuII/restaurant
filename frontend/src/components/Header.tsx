type Props = { title: string; subtitle?: string; onMenu: () => void };

export default function Header({ title, subtitle, onMenu }: Props) {
  return (
    <header className="flex items-start gap-3 border-b border-gray-800 bg-[#0d1220]/80 px-4 py-4 backdrop-blur md:px-8 md:py-5">
      <button
        onClick={onMenu}
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-800 text-lg text-gray-300 hover:bg-white/5 md:hidden"
        aria-label="Открыть меню"
      >
        ☰
      </button>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-gray-100 md:text-xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
    </header>
  );
}
