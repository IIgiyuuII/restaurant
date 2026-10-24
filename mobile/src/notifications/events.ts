/**
 * Чистая логика уведомлений: что считать «важным событием» и как не слать дубли.
 * Ничего не знает про Expo/сеть/хранилище — поэтому легко тестируется (см. events.test.ts).
 */
import type { AppData } from '../api';
import type { Batch } from '../types';
import { DISHES, BATCHES, formatDate, parseDate, plural } from '../utils';
import type { Category, NotifPrefs } from './prefs';

export type TabId = 'dashboard' | 'stock' | 'stoplist' | 'hot' | 'orders' | 'delivery' | 'writeoffs';

export type AppEvent = { key: string; category: Category; title: string; body: string; tab: TabId };

export type Snapshot = {
  v: 1;
  stop: string[];
  out: string[];
  hot: string[];
  rejected: string[];
  /** key → когда последний раз уведомляли (антидребезг). */
  last: Record<string, number>;
};

const HOUR = 3_600_000;
/** Одно и то же событие не повторяем чаще, чем раз в 6 часов (блюдо «мигает» в стоп-листе). */
export const COOLDOWN_MS = 6 * HOUR;
/** Сколько напоминаний о сроке годности держим запланированными (iOS позволяет 64 всего). */
export const MAX_SCHEDULED = 48;
/** Давно просроченное не напоминаем — только свежие события. */
const STALE_MS = 12 * HOUR;

export const EMPTY_SNAPSHOT: Snapshot = { v: 1, stop: [], out: [], hot: [], rejected: [], last: {} };

const quote = (s: string) => `«${s}»`;

function names(list: string[], max = 3): string {
  const head = list.slice(0, max).join(', ');
  return list.length > max ? `${head} и ещё ${list.length - max}` : head;
}

type Input = Pick<AppData, 'stoplist' | 'restock' | 'hotOffers' | 'history'>;

/**
 * Сравнивает свежие данные с прошлым снимком и возвращает новые события.
 * prev === null — первый запуск: просто запоминаем состояние, ничего не шлём
 * (иначе пользователь получил бы лавину «новостей» про то, что уже давно так).
 */
export function detectEvents(
  prev: Snapshot | null,
  data: Input,
  prefs: NotifPrefs,
  now: number,
): { events: AppEvent[]; next: Snapshot } {
  const stopped = data.stoplist;
  const out = data.restock.filter((r) => r.status === 'out');
  const hot = data.hotOffers.filter((o) => o.level === 'critical');
  const rejected = data.history.filter((o) => o.status === 'rejected');

  const last: Record<string, number> = {};
  for (const [k, t] of Object.entries(prev?.last ?? {})) if (now - t < 48 * HOUR) last[k] = t;

  const next: Snapshot = {
    v: 1,
    stop: stopped.map((d) => d.id),
    out: out.map((r) => r.product_id),
    hot: hot.map((o) => o.dish_id),
    rejected: rejected.map((o) => o.id),
    last,
  };
  if (!prev) return { events: [], next };

  const fresh = <T,>(items: T[], seen: string[], id: (x: T) => string, ns: string): T[] =>
    items.filter((x) => {
      const key = `${ns}:${id(x)}`;
      if (seen.includes(id(x))) return false;
      if (now - (last[key] ?? 0) < COOLDOWN_MS) return false;
      last[key] = now; // помечаем, даже если категория выключена — чтобы при включении не посыпались старые
      return true;
    });

  const events: AppEvent[] = [];

  const newStop = fresh(stopped, prev.stop, (d) => d.id, 'stop');
  if (prefs.stoplist && newStop.length === 1) {
    const d = newStop[0];
    events.push({ key: `stop:${d.id}`, category: 'stoplist', tab: 'stoplist', title: 'Блюдо ушло в стоп-лист', body: d.reason ? `${quote(d.name)} — ${d.reason.replace(/^Не хватает:\s*/i, 'не хватает: ')}` : quote(d.name) });
  } else if (prefs.stoplist && newStop.length > 1) {
    events.push({ key: `stop:${newStop.map((d) => d.id).join(',')}`, category: 'stoplist', tab: 'stoplist', title: `В стоп-листе ещё ${newStop.length} ${plural(newStop.length, DISHES)}`, body: names(newStop.map((d) => d.name)) });
  }

  const newOut = fresh(out, prev.out, (r) => r.product_id, 'out');
  if (prefs.restock && newOut.length === 1) {
    const r = newOut[0];
    const blocked = r.blocked_dishes > 0 ? ` · не готовятся: ${r.blocked_dishes} ${plural(r.blocked_dishes, DISHES)}` : '';
    events.push({ key: `out:${r.product_id}`, category: 'restock', tab: 'delivery', title: 'Продукт закончился', body: `${r.name}${blocked}` });
  } else if (prefs.restock && newOut.length > 1) {
    events.push({ key: `out:${newOut.map((r) => r.product_id).join(',')}`, category: 'restock', tab: 'delivery', title: `Закончились продукты: ${newOut.length}`, body: names(newOut.map((r) => r.name)) });
  }

  const newHot = fresh(hot, prev.hot, (o) => o.dish_id, 'hot');
  if (prefs.hot && newHot.length === 1) {
    const o = newHot[0];
    events.push({ key: `hot:${o.dish_id}`, category: 'hot', tab: 'hot', title: `Срочно продать: ${o.name}`, body: o.summary || 'Продукты для блюда скоро испортятся' });
  } else if (prefs.hot && newHot.length > 1) {
    events.push({ key: `hot:${newHot.map((o) => o.dish_id).join(',')}`, category: 'hot', tab: 'hot', title: `Срочных предложений: ${newHot.length}`, body: names(newHot.map((o) => o.name)) });
  }

  const newRej = fresh(rejected, prev.rejected, (o) => o.id, 'rej');
  if (prefs.orders && newRej.length === 1) {
    const o = newRej[0];
    events.push({ key: `rej:${o.id}`, category: 'orders', tab: 'orders', title: `Заказ №${o.number} отклонён`, body: o.reason || 'Не хватило ингредиентов' });
  } else if (prefs.orders && newRej.length > 1) {
    events.push({ key: `rej:${newRej.map((o) => o.id).join(',')}`, category: 'orders', tab: 'orders', title: `Отклонено заказов: ${newRej.length}`, body: newRej.map((o) => `№${o.number}`).join(', ') });
  }

  return { events, next };
}

// ───────────────────────── Срок годности ─────────────────────────
// Срок годности известен заранее, поэтому напоминания ПЛАНИРУЕМ на точное время локальными
// уведомлениями — они сработают, даже если приложение закрыто и фоновые задачи спят.

export type Milestone = { key: string; at: number; expAt: number; title: string; body: string; kind: 'soon' | 'gone' };

export function expiryMilestones(batches: Batch[]): Milestone[] {
  const out: Milestone[] = [];
  for (const b of batches) {
    if (!(b.remaining_quantity > 0)) continue;
    const exp = parseDate(b.expires_at).getTime();
    if (Number.isNaN(exp)) continue;
    const what = `${quote(b.product)} · поставка ${b.delivery_number}`;
    out.push({ key: `exp:${b.id}:soon`, kind: 'soon', at: exp - 24 * HOUR, expAt: exp, title: 'Срок годности истекает', body: `${what} — годна до ${formatDate(b.expires_at)}` });
    out.push({ key: `exp:${b.id}:gone`, kind: 'gone', at: exp, expAt: exp, title: 'Срок годности вышел', body: `${what} — партию нужно списать` });
  }
  return out;
}

/**
 * «Устарело» оцениваем по состоянию партии, а не по моменту вехи:
 *  • «истекает» важно, пока партия ещё не просрочена (потом это скажет «вышел»);
 *  • «вышел» важно только в первые 12 часов после просрочки.
 */
function isStale(m: Milestone, now: number): boolean {
  return m.kind === 'soon' ? m.expAt <= now : m.at < now - STALE_MS;
}

export type ExpiryPlan = {
  schedule: Milestone[];
  immediate: Milestone[];
  cancel: string[];
  handled: string[];
};

export function planExpiry(
  milestones: Milestone[],
  handledPrev: string[],
  scheduledIds: Iterable<string>,
  now: number,
  opts: { enabled: boolean; firstRun: boolean },
): ExpiryPlan {
  const wanted = new Set(milestones.map((m) => m.key));
  const handled = new Set(handledPrev);
  const scheduled = new Set([...scheduledIds].filter((id) => id.startsWith('exp:')));
  const plan: ExpiryPlan = { schedule: [], immediate: [], cancel: [], handled: [] };

  if (!opts.enabled) {
    plan.cancel = [...scheduled];
    for (const m of milestones) if (m.at <= now) handled.add(m.key); // прошлое молча «закрываем»
    plan.handled = [...handled].filter((k) => wanted.has(k));
    return plan;
  }

  // Пока партия жива, её напоминания остаются запланированными; исчезла (списана/израсходована) — отменяем.
  plan.cancel = [...scheduled].filter((id) => !wanted.has(id));
  let capacity = MAX_SCHEDULED - [...scheduled].filter((id) => wanted.has(id)).length;

  for (const m of [...milestones].sort((a, b) => a.at - b.at)) {
    if (handled.has(m.key)) continue;
    if (m.at > now + 15_000) {
      if (capacity <= 0) continue; // не влезло — запланируем при следующей синхронизации
      plan.schedule.push(m);
      handled.add(m.key);
      capacity--;
    } else if (opts.firstRun || isStale(m, now)) {
      handled.add(m.key); // давно так — не тревожим
    } else {
      plan.immediate.push(m);
      handled.add(m.key);
    }
  }
  plan.handled = [...handled].filter((k) => wanted.has(k));
  return plan;
}

/** Сводит «пачку» срочных напоминаний в 1–2 уведомления. */
export function summarizeImmediate(list: Milestone[]): AppEvent[] {
  const events: AppEvent[] = [];
  for (const kind of ['gone', 'soon'] as const) {
    const items = list.filter((m) => m.kind === kind);
    if (items.length === 0) continue;
    if (items.length === 1) {
      const m = items[0];
      events.push({ key: m.key, category: 'expiry', tab: 'writeoffs', title: m.title, body: m.body });
      continue;
    }
    const title = kind === 'gone'
      ? `Просрочено ${items.length} ${plural(items.length, BATCHES)}`
      : `Истекает ${items.length} ${plural(items.length, BATCHES)} в течение суток`;
    const body = names(items.map((m) => m.body.split(' · ')[0]));
    events.push({ key: `exp:${kind}:${items[0].key}`, category: 'expiry', tab: 'writeoffs', title, body });
  }
  return events;
}
