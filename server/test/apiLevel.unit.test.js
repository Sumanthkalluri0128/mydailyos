const test = require('node:test');
const assert = require('node:assert');
const { API_LEVEL, FEATURES } = require('../lib/apiLevel');

test('the server reports an api level the phone build can check', () => {
  assert.ok(Number.isInteger(API_LEVEL) && API_LEVEL >= 60);
  assert.ok(FEATURES.includes('plan-start-mode') && FEATURES.includes('goal-range-v2'));
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
  assert.match(src, /apiLevel: require\('\.\/lib\/apiLevel'\)\.API_LEVEL/);
});
