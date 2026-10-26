const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const path = require('path');
const A = require('../lib/a11y');

test('contrast maths matches known values', () => {
  assert.equal(A.contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(A.contrast('#777777', '#ffffff').toFixed(2), '4.48');   // the classic "just fails AA" grey
  assert.ok(A.contrast('#ffffff', '#ffffff') === 1);
});
test('colour-blind simulation: red and green collapse for deuteranopia, grey stays grey', () => {
  const d = A.distinguish('#20A46B', '#D64545');                          // the OLD pair: lightness gap was only 3
  assert.ok(Math.min(...d.views.map((v) => v.dL)) < 10);
  const g = A.simulate('#808080', 'protanopia'); assert.ok(A.deltaE('#808080', g) < 6);
});
test('palette rules catch a bad colour', () => {
  const bad = { text: '#222', muted: '#aaa', bg: '#fff', surface: '#fff', primary: '#6847e8', primarySolid: '#8f7dff', danger: '#d64545', dangerSolid: '#ff6b6b', success: '#20a46b' };
  const f = A.failures(bad).map((x) => x.rule);
  assert.ok(f.some((r) => r.includes('muted on bg')) && f.some((r) => r.includes('white on primarySolid')) && f.some((r) => r.includes('success vs danger')));
});
test('shipped web palettes (light and dark) pass every rule', () => {
  const css = ['App.css', 'styles/redesign.css'].map((f) => fs.readFileSync(path.join(__dirname, '../../client/src', f), 'utf8')).join('\n');
  const light = A.cssTokens(css, ':root'), dark = { ...light, ...A.cssTokens(css, '(?::root)?\\[data-theme="dark"\\]') };
  const norm = (t) => ({ text: t.text, muted: t['text-muted'], bg: t.bg, surface: t.surface, primary: t.primary, primarySolid: t['primary-solid'], danger: t.danger, dangerSolid: t['danger-solid'], success: t.success, kcal: t.kcal, protein: t.protein, water: t.water, steps: t.steps });
  for (const [n, P] of [['light', norm(light)], ['dark', norm(dark)]]) assert.deepEqual(A.failures(P), [], `${n}: ${JSON.stringify(A.failures(P))}`);
});
