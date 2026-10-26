const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('../lib/medicines'); const { toneCheck } = require('../lib/safety');
const med = (o) => ({ _id: 'm1', name: 'Vitamin D', dose: '1 tablet', kind: 'supplement', times: ['08:00', '20:00'], days: [], active: true, ...o });

test('cleanMed validates and normalises', () => {
  const c = M.cleanMed({ name: '  Iron ', times: ['20:00', '08:00', '08:00', '25:00', 'x'], days: [1, 1, 9, 3] });
  assert.deepEqual([c.name, c.times, c.days, c.kind, c.active], ['Iron', ['08:00', '20:00'], [1, 3], 'medicine', true]);
  assert.equal(M.cleanMed({ name: 'x', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6] }).days.length, 0);   // all 7 days = every day
  assert.throws(() => M.cleanMed({ name: '', times: ['08:00'] }), /name/); assert.throws(() => M.cleanMed({ name: 'x', times: [] }), /time/);
  assert.throws(() => M.cleanMed({ name: 'x', times: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00'] }), /6/);
});
test('weekday filter and inactive medicines', () => {
  const mon = med({ days: [1] });        // 2026-10-26 is a Monday
  assert.equal(M.dosesFor(mon, '2026-10-26').length, 2); assert.equal(M.dosesFor(mon, '2026-10-27').length, 0);
  assert.equal(M.dosesFor(med({ active: false }), '2026-10-26').length, 0);
});
test('checklist marks taken, due and later; never "missed"', () => {
  const c = M.checklist({ meds: [med()], logs: [{ medId: 'm1', date: '2026-10-25', time: '08:00', takenAt: 'x' }], date: '2026-10-25', nowHm: '21:00' });
  assert.deepEqual(c.items.map((i) => i.state), ['taken', 'due']); assert.equal(c.taken, 1); assert.equal(c.due, 1);
  assert.equal(M.checklist({ meds: [med()], logs: [], date: '2026-10-25', nowHm: '07:00' }).items.every((i) => i.state === 'later'), true);
  assert.ok(/not medical advice/i.test(c.note)); assert.ok(toneCheck(c.note).ok);
  assert.ok(!JSON.stringify(c).toLowerCase().includes('missed'));
});
test('reminders obey quiet hours: shifted to the end of quiet time, never inside it', () => {
  const r = M.planReminders({ meds: [med({ times: ['06:30', '12:00', '23:00'] })], date: '2026-10-25', quiet: { start: '22:00', end: '07:00' }, nowHm: '00:00' });
  assert.deepEqual(r.map((x) => [x.at, x.shifted, x.nextDay]), [['07:00', true, false], ['07:00', true, true], ['12:00', false, false]]);
  for (const x of r) assert.ok(x.at >= '07:00' && x.at < '22:00');
});
test('reminders skip taken and past doses', () => {
  const r = M.planReminders({ meds: [med()], date: '2026-10-25', nowHm: '09:00', takenKeys: new Set(['m1|20:00']) });
  assert.deepEqual(r, []);
  assert.equal(M.planReminders({ meds: [med()], date: '2026-10-25', nowHm: '09:00' }).length, 1);
});
