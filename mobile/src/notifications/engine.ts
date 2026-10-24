import type { AppData } from '../api';
import { KEYS, storage } from '../storage';
import { detectEvents, expiryMilestones, planExpiry, summarizeImmediate } from './events';
import type { Snapshot } from './events';
import { cancel, getPermission, present, schedule, scheduledIds } from './notify';
import { loadPrefs } from './prefs';

type Persisted = {
  snap: Snapshot | null;
  /** Какие вехи срока годности уже запланированы/показаны. null — первый запуск. */
  handled: string[] | null;
};

let chain: Promise<void> = Promise.resolve();

/**
 * Единая точка: получает свежие данные (из опроса на экране ИЛИ из фоновой задачи),
 *  1) находит новые события и показывает уведомления;
 *  2) синхронизирует запланированные напоминания о сроках годности.
 * Вызовы выстраиваются в очередь, чтобы два источника не наложились друг на друга.
 */
export function processData(data: AppData): Promise<void> {
  chain = chain.then(() => run(data)).catch(() => {});
  return chain;
}

async function run(data: AppData): Promise<void> {
  const [prefs, perm, state] = await Promise.all([
    loadPrefs(),
    getPermission(),
    storage.get<Persisted>(KEYS.notifSnapshot, { snap: null, handled: null }),
  ]);
  const now = Date.now();
  // Нет разрешения или всё выключено — состояние всё равно обновляем (молча),
  // чтобы при включении не прилетела лавина «новостей» про старое.
  const deliver = prefs.enabled && perm === 'granted';

  const { events, next } = detectEvents(state.snap, data, prefs, now);

  const plan = planExpiry(
    expiryMilestones(data.batches),
    state.handled ?? [],
    await scheduledIds(),
    now,
    { enabled: deliver && prefs.expiry, firstRun: state.handled === null },
  );

  if (deliver) {
    await cancel(plan.cancel);
    for (const m of plan.schedule) await schedule(m);
    for (const e of [...events, ...summarizeImmediate(plan.immediate)]) await present(e);
  } else {
    await cancel(plan.cancel);
  }

  await storage.set(KEYS.notifSnapshot, { snap: next, handled: plan.handled } satisfies Persisted);
}

/** Заказ оформлен с этого телефона — не уведомляем о нём как о «чужом» отклонённом. */
export async function markOwnOrder(id: string): Promise<void> {
  const state = await storage.get<Persisted>(KEYS.notifSnapshot, { snap: null, handled: null });
  if (!state.snap || state.snap.rejected.includes(id)) return;
  await storage.set(KEYS.notifSnapshot, { ...state, snap: { ...state.snap, rejected: [...state.snap.rejected, id] } });
}
