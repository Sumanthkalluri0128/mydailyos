import { readFileSync } from 'fs';
import { join } from 'path';
// a11y.js is a plain copy of web/server/lib/a11y.js (contrast + colour-blind maths)
const A = require('../a11y');

const src = readFileSync(join(__dirname, '../theme.tsx'), 'utf8');
const block = (name: string) => {
  const m = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  const o: Record<string, string> = {};
  if (m) for (const t of m[1].matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{3,6})'/g)) o[t[1]] = t[2];
  return o;
};
const norm = (o: any) => ({ text: o.ink, muted: o.muted, bg: o.bg, surface: o.card, primary: o.primary, primarySolid: o.primarySolid, danger: o.danger, dangerSolid: o.dangerSolid, success: o.success, successInk: o.successInk, successSoft: o.successSoft, dangerInk: o.dangerInk, dangerSoft: o.dangerSoft, warnInk: o.warnInk, warnSoft: o.warnSoft, kcal: o.kcal, protein: o.protein, water: o.water, steps: o.steps });

describe('mobile palettes', () => {
  it('light and dark pass contrast and colour-blind rules', () => {
    expect(A.failures(norm(block('lightColors')))).toEqual([]);
    expect(A.failures(norm(block('darkColors')))).toEqual([]);
  });
  it('has the tokens the buttons rely on', () => {
    for (const n of ['lightColors', 'darkColors']) { const o = block(n); expect(!!o.primarySolid && !!o.dangerSolid).toBe(true); }
  });
});
