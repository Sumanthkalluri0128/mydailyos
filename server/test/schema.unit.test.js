const test = require('node:test');
const assert = require('node:assert/strict');
const { s, body } = require('../lib/schema');

const run = (schema, input) => { const req = { body: input }; let status = 200; let sent; let called = false;
  body(schema)(req, { status(c) { status = c; return this; }, json(b) { sent = b; return this; } }, () => { called = true; }); return { req, status, sent, called }; };

test('unknown keys are dropped, known keys are cleaned and kept', () => {
  const r = run(s.object({ days: s.number({ min: 1, max: 7, int: true }), kind: s.string({ max: 30 }) }), { days: '5', kind: '  maintenance  ', admin: true, __proto__: { x: 1 } });
  assert.equal(r.called, true); assert.deepEqual(r.req.body, { days: 5, kind: 'maintenance' });
});
test('wrong types and out-of-range values are refused before the handler with a plain message', () => {
  for (const [input, msg] of [[{ days: 'lots' }, /days must be a number/], [{ days: 9 }, /between 1 and 7/], [{ days: 2.5 }, /whole number/], [{ kind: 5 }, /kind must be text/], [{ kind: 'x'.repeat(31) }, /at most 30/]]) {
    const r = run(s.object({ days: s.number({ min: 1, max: 7, int: true }), kind: s.string({ max: 30 }) }), input);
    assert.equal(r.status, 400); assert.equal(r.called, false); assert.match(r.sent.message, msg);
  }
});
test('missing body counts as empty; required fields are enforced; empty string counts as missing', () => {
  assert.equal(run(s.object({ on: s.boolean() }), undefined).called, true);
  assert.match(run(s.object({ focus: s.required(s.array(s.string())) }), {}).sent.message, /focus is required/);
  assert.equal(run(s.object({ note: s.string() }), { note: '' }).called, true);
});
test('booleans and dates', () => {
  assert.deepEqual(run(s.object({ on: s.boolean(), today: s.date() }), { on: 'false', today: '2026-11-05' }).req.body, { on: false, today: '2026-11-05' });
  assert.equal(run(s.object({ on: s.boolean() }), { on: 'maybe' }).status, 400);
  assert.equal(run(s.object({ today: s.date() }), { today: '2026-13-45' }).status, 400);
  assert.equal(run(s.object({ today: s.date() }), { today: 'yesterday' }).status, 400);
});
test('lists: item rules, size cap, and oneOf', () => {
  const sc = s.object({ ids: s.array(s.string({ oneOf: ['a', 'b'] }), { max: 2 }) });
  assert.deepEqual(run(sc, { ids: ['a', 'b'] }).req.body, { ids: ['a', 'b'] });
  assert.match(run(sc, { ids: ['a', 'z'] }).sent.message, /ids\[1\] must be one of/);
  assert.match(run(sc, { ids: ['a', 'b', 'a'] }).sent.message, /at most 2/);
  assert.match(run(sc, { ids: 'a' }).sent.message, /must be a list/);
});
test('strict mode rejects extra keys; body must be an object', () => {
  assert.match(run(s.object({ a: s.string() }, { strict: true }), { a: 'x', b: 1 }).sent.message, /b is not allowed/);
  assert.equal(run(s.object({}), [1, 2]).status, 400); assert.equal(run(s.object({}), 'text').status, 400);
});
test('nested objects keep their path in the message', () => {
  const sc = s.object({ goal: s.object({ kg: s.number({ min: 30, max: 300 }) }) });
  assert.match(run(sc, { goal: { kg: 10 } }).sent.message, /goal\.kg must be between/);
});

test('any: accepts numbers, text, lists and objects up to a size, refuses huge values', () => {
  const sc = s.object({ v: s.any({ maxJson: 20 }) });
  assert.deepEqual(run(sc, { v: 5 }).req.body, { v: 5 }); assert.deepEqual(run(sc, { v: 'abc' }).req.body, { v: 'abc' }); assert.deepEqual(run(sc, { v: [1, 2] }).req.body, { v: [1, 2] });
  assert.match(run(sc, { v: 'x'.repeat(50) }).sent.message, /too large/);
});
test('passthrough keeps fields the schema does not name, but still checks the ones it does', () => {
  const sc = s.object({ sessions: s.array(s.object({}, { passthrough: true }), { max: 2 }) });
  const r = run(sc, { sessions: [{ id: 'a', date: '2026-11-05', extra: { deep: 1 } }], other: 'dropped' });
  assert.deepEqual(r.req.body, { sessions: [{ id: 'a', date: '2026-11-05', extra: { deep: 1 } }] });
  assert.match(run(sc, { sessions: [{}, {}, {}] }).sent.message, /at most 2/);
  assert.match(run(sc, { sessions: [5] }).sent.message, /must be an object/);
});
