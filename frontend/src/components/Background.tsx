/** Мягкие волнообразные формы на фоне (как на макете). Цвета берутся из переменных темы. */
export default function Background() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path
        d="M-40 560 C 200 440, 360 700, 620 640 C 880 580, 1000 800, 1500 720 L 1500 940 L -40 940 Z"
        style={{ fill: 'var(--wave-a)' }}
      />
      <path
        d="M-40 380 C 160 300, 300 460, 520 420 C 760 380, 900 560, 1500 480 L 1500 940 L -40 940 Z"
        style={{ fill: 'var(--wave-b)' }}
      />
      <path
        d="M700 -20 C 820 120, 1000 60, 1120 180 C 1240 300, 1360 220, 1480 300 L 1480 -20 Z"
        style={{ fill: 'var(--wave-b)' }}
      />
    </svg>
  );
}
