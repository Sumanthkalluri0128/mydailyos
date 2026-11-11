const test = require('node:test');
const assert = require('node:assert/strict');
const { homeCardsView, HOME_CARDS } = require('../lib/features');
const { createStats, CARD_IDS } = require('../lib/serverStats');

test('a brand-new person sees a quiet Home: no optional cards yet', () => {
  assert.deepEqual(homeCardsView({ counts: {} }), []);
  assert.deepEqual(homeCardsView({ counts: { activeDays: 1 } }), []);
});
test('cards appear as days of use add up: check-in on day 2, side quest on day 3, event mode on day 7', () => {
  assert.deepEqual(homeCardsView({ counts: { activeDays: 2 } }), ['checkin']);
  assert.deepEqual(homeCardsView({ counts: { activeDays: 3 } }), ['checkin', 'sidequest']);
  assert.deepEqual(homeCardsView({ counts: { activeDays: 7 } }), ['checkin', 'sidequest', 'eventmode']);
});
test('"show all" reveals every optional card, and junk counts are ignored', () => {
  assert.deepEqual(homeCardsView({ counts: {}, showAll: true }), Object.keys(HOME_CARDS));
  assert.deepEqual(homeCardsView({ counts: { activeDays: 'lots', foodLogs: -3 } }), []);
});
test('card opens are counted only for known cards', () => {
  const st = createStats({ now: () => Date.UTC(2026, 10, 6) });
  assert.equal(st.count('card.water'), true); assert.equal(st.count('card.w'), true);
  assert.equal(st.count('card.hacked'), false); assert.equal(st.count('water'), false);
  assert.ok(CARD_IDS.includes('w') && CARD_IDS.includes('ex'));
});
