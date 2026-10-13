
type Props = {
  title: string;
  subtitle?: string;
  onMenu: () => void;
  menuOpen: boolean;
};

export default function Header({
  title,
  subtitle,
  onMenu,
  menuOpen,
}: Props) {
  return (
    <header className="relative z-30 flex w-full min-w-0 shrink-0 items-center gap-3 border-b border-gray-800 bg-[#0d1220]/95 px-3 py-3 backdrop-blur sm:gap-4 sm:px-5 sm:py-4 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label={menuOpen ? 'Свернуть меню' : 'Открыть меню'}
        aria-expanded={menuOpen}
        aria-controls="app-sidebar"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-700 transition-colors duration-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span
            className={[
              'absolute h-0.5 w-5 rounded bg-gray-300',
              'transition-transform duration-300 ease-in-out',
              menuOpen ? 'rotate-45' : '-translate-y-1.5',
            ].join(' ')}
          />

          <span
            className={[
              'absolute h-0.5 w-5 rounded bg-gray-300',
              'transition-opacity duration-200',
              menuOpen ? 'opacity-0' : 'opacity-100',
            ].join(' ')}
          />

          <span
            className={[
              'absolute h-0.5 w-5 rounded bg-gray-300',
              'transition-transform duration-300 ease-in-out',
              menuOpen ? '-rotate-45' : 'translate-y-1.5',
            ].join(' ')}
          />
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold text-gray-100 sm:text-xl">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-0.5 hidden max-w-full truncate text-sm text-gray-500 sm:block">
            {subtitle}
          </p>
        )}
      </div>
    </header>
  );
}
