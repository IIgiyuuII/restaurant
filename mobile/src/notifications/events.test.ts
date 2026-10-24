// Запуск: npx tsx src/notifications/events.test.ts
import assert from 'node:assert/strict';
import { detectEvents, expiryMilestones, planExpiry, summarizeImmediate, MAX_SCHEDULED } from './events';
import type { Snapshot } from './events';
import { DEFAULT_PREFS } from './prefs';

const H = 3_600_000;
const NOW = Date.parse('2026-10-15T12:00:00Z');

const stop = (id: string, name = id) => ({ id, name, portions: 0, reason: 'Не хватает: Молоко (нужно 200 г, есть 0 г)' });
const empty = { stoplist: [], restock: [], hotOffers: [], history: [] };
const batch = (id: string, hoursLeft: number, qty = 100) => ({
  id, product_id: 'p', product: 'Молоко', unit: 'ml', delivery_number: 'D-1', initial_quantity: 500,
  remaining_quantity: qty, received_at: '', expires_at: new Date(NOW + hoursLeft * H).toISOString(), hours_left: hoursLeft, expired: hoursLeft <= 0,
});
let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; console.log('  ✓', name); };

console.log('detectEvents');
test('первый запуск ничего не шлёт, но запоминает состояние', () => {
  const r = detectEvents(null, { ...empty, stoplist: [stop('a')] }, DEFAULT_PREFS, NOW);
  assert.equal(r.events.length, 0);
  assert.deepEqual(r.next.stop, ['a']);
});
test('новое блюдо в стоп-листе → одно событие с причиной', () => {
  const prev: Snapshot = { v: 1, stop: ['a'], out: [], hot: [], rejected: [], last: {} };
  const r = detectEvents(prev, { ...empty, stoplist: [stop('a'), stop('b', 'Борщ')] }, DEFAULT_PREFS, NOW);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].tab, 'stoplist');
  assert.match(r.events[0].body, /«Борщ» — не хватает: Молоко/);
});
test('несколько блюд сворачиваются в одно уведомление', () => {
  const prev: Snapshot = { v: 1, stop: [], out: [], hot: [], rejected: [], last: {} };
  const r = detectEvents(prev, { ...empty, stoplist: [stop('a'), stop('b'), stop('c'), stop('d')] }, DEFAULT_PREFS, NOW);
  assert.equal(r.events.length, 1);
  assert.match(r.events[0].title, /4 блюда/);
  assert.match(r.events[0].body, /и ещё 1/);
});
test('то, что уже было в стоп-листе, не повторяется', () => {
  const prev: Snapshot = { v: 1, stop: ['a'], out: [], hot: [], rejected: [], last: {} };
  assert.equal(detectEvents(prev, { ...empty, stoplist: [stop('a')] }, DEFAULT_PREFS, NOW).events.length, 0);
});
test('антидребезг: блюдо вышло и вернулось в течение 6 ч → тишина', () => {
  const prev: Snapshot = { v: 1, stop: [], out: [], hot: [], rejected: [], last: { 'stop:a': NOW - 2 * H } };
  assert.equal(detectEvents(prev, { ...empty, stoplist: [stop('a')] }, DEFAULT_PREFS, NOW).events.length, 0);
  const later = detectEvents(prev, { ...empty, stoplist: [stop('a')] }, DEFAULT_PREFS, NOW + 5 * H);
  assert.equal(later.events.length, 1);
});
test('выключенная категория молчит, но состояние обновляется', () => {
  const prev: Snapshot = { v: 1, stop: [], out: [], hot: [], rejected: [], last: {} };
  const r = detectEvents(prev, { ...empty, stoplist: [stop('a')] }, { ...DEFAULT_PREFS, stoplist: false }, NOW);
  assert.equal(r.events.length, 0);
  assert.deepEqual(r.next.stop, ['a']);
});
test('продукт закончился / срочное предложение / отклонённый заказ', () => {
  const prev: Snapshot = { v: 1, stop: [], out: [], hot: [], rejected: [], last: {} };
  const r = detectEvents(prev, {
    stoplist: [],
    restock: [{ product_id: 'm', name: 'Молоко', unit: 'ml', min_stock: 1, quantity: 0, status: 'out', suggested_quantity: 5, blocked_dishes: 2 }],
    hotOffers: [{ dish_id: 'd', name: 'Омлет', price: 1, portions: 3, score: 1, level: 'critical', hours_left: 2, summary: 'Молоко истекает', reasons: [] }],
    history: [{ id: 'o1', number: 7, status: 'rejected', reason: 'Нет яиц', created_at: '', revenue: 0, revenue_estimated: false, items: [] }],
  }, DEFAULT_PREFS, NOW);
  assert.deepEqual(r.events.map((e) => e.category).sort(), ['hot', 'orders', 'restock']);
  assert.match(r.events.find((e) => e.category === 'restock')!.body, /не готовятся: 2 блюда/);
});

console.log('planExpiry');
test('будущие напоминания планируются на точное время, один раз', () => {
  const ms = expiryMilestones([batch('b1', 30)]);
  const p1 = planExpiry(ms, [], [], NOW, { enabled: true, firstRun: false });
  assert.equal(p1.schedule.length, 2);
  assert.equal(p1.immediate.length, 0);
  const soon = p1.schedule.find((m) => m.kind === 'soon')!;
  assert.equal(soon.at, NOW + 6 * H); // 30 ч − 24 ч
  const p2 = planExpiry(ms, p1.handled, p1.schedule.map((m) => m.key), NOW, { enabled: true, firstRun: false });
  assert.equal(p2.schedule.length + p2.immediate.length, 0, 'повторная синхронизация не дублирует');
});
test('новая поставка с коротким сроком: «за 24 ч» уже прошло → сразу, «вышел» → по плану', () => {
  const p = planExpiry(expiryMilestones([batch('b2', 5)]), [], [], NOW, { enabled: true, firstRun: false });
  assert.equal(p.immediate.length, 1);
  assert.equal(p.immediate[0].kind, 'soon');
  assert.equal(p.schedule.length, 1);
  assert.equal(p.schedule[0].kind, 'gone');
});
test('первый запуск и давно просроченное — молча', () => {
  const ms = expiryMilestones([batch('b3', 5), batch('old', -48)]);
  const p = planExpiry(ms, [], [], NOW, { enabled: true, firstRun: true });
  assert.equal(p.immediate.length, 0);
  const q = planExpiry(expiryMilestones([batch('old', -48)]), [], [], NOW, { enabled: true, firstRun: false });
  assert.equal(q.immediate.length, 0, 'старше 12 ч — не тревожим');
});
test('партия списана → её напоминания отменяются и забываются', () => {
  const p = planExpiry([], ['exp:b1:soon', 'exp:b1:gone'], ['exp:b1:soon', 'exp:b1:gone'], NOW, { enabled: true, firstRun: false });
  assert.deepEqual(p.cancel.sort(), ['exp:b1:gone', 'exp:b1:soon']);
  assert.deepEqual(p.handled, []);
});
test('партия с нулевым остатком не напоминает', () => {
  assert.equal(expiryMilestones([batch('z', 10, 0)]).length, 0);
});
test('категория выключена → всё отменено, ничего не планируется', () => {
  const p = planExpiry(expiryMilestones([batch('b1', 30)]), [], ['exp:b1:soon'], NOW, { enabled: false, firstRun: false });
  assert.equal(p.schedule.length, 0);
  assert.deepEqual(p.cancel, ['exp:b1:soon']);
});
test('лимит запланированных (iOS ≤ 64): лишнее ждёт следующей синхронизации', () => {
  const many = Array.from({ length: 40 }, (_, i) => batch('x' + i, 30 + i));
  const p = planExpiry(expiryMilestones(many), [], [], NOW, { enabled: true, firstRun: false });
  assert.equal(p.schedule.length, MAX_SCHEDULED);
  assert.ok(p.handled.length === MAX_SCHEDULED, 'не вошедшие остаются необработанными');
});
test('сводка срочных: несколько партий → одно уведомление', () => {
  const ms = expiryMilestones([batch('a', 3), batch('b', 4), batch('c', 5)]).filter((m) => m.kind === 'soon');
  const ev = summarizeImmediate(ms);
  assert.equal(ev.length, 1);
  assert.match(ev[0].title, /Истекает 3 партии/);
});

console.log(`\nOK — ${n} тестов`);
