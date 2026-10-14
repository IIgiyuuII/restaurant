import Icon from './Icons';

type Props = { message: string; onRetry: () => void; onClose: () => void };

export default function ErrorBanner({ message, onRetry, onClose }: Props) {
  return (
    <div
      role="alert"
      className="mb-6 flex backdrop-blur-md flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 sm:flex-nowrap sm:px-5"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
        <Icon name="info" size={18} />
      </span>
      <p className="min-w-0 flex-1 text-sm text-gray-100">
        Ошибка: {message}. Проверь, что Go-сервер запущен на порту 8081.
      </p>
      <button
        onClick={onRetry}
        className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/25 transition-colors hover:bg-accent-hover"
      >
        Повторить
      </button>
      <button
        onClick={onClose}
        className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-hover hover:text-gray-100"
        aria-label="Закрыть"
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
