const test = require('node:test');
const assert = require('node:assert');
const { sanitizeTour, mergeTour } = require('../lib/tourState');

test('sanitize keeps only known keys and short strings', () => {
  const t = sanitizeTour({ goal: 'lose', coach: 'zoro<script>', status: 'active', index: 99, done: ['water', 5, 'x'.repeat(100)], evil: 'x', events: 'nope' });
  assert.equal(t.goal, 'lose'); assert.equal(t.coach, 'zoroscript'); assert.equal(t.index, 20);
  assert.deepEqual(t.done, ['water']); assert.deepEqual(t.events, []); assert.equal(t.evil, undefined);
  assert.equal(sanitizeTour({ goal: 'x', status: 'y' }).goal, ''); assert.equal(sanitizeTour({ status: 'y' }).status, 'idle');
});
test('merge never loses completed steps; newer side wins for status', () => {
  const m = mergeTour({ done: ['water'], hintsSeen: ['log-1'], status: 'active', updatedAt: 1, checklistDismissed: true }, sanitizeTour({ done: ['food'], status: 'paused', updatedAt: 5 }));
  assert.deepEqual(m.done.sort(), ['food', 'water']); assert.equal(m.status, 'paused');
  assert.deepEqual(m.hintsSeen, ['log-1']); assert.equal(m.checklistDismissed, true); assert.equal(m.updatedAt, 5);
});
