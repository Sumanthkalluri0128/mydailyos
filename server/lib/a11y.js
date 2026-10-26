// Accessibility maths: WCAG contrast, colour-blindness simulation and a "can these status colours be told apart?" check.
// Pure. Used by tools/a11y-check.js and by the palette test so a bad colour change fails the build.
const hex = (h) => { const s = String(h).replace('#', ''); const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const gam = (x) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
const luminance = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function contrast(a, b) { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); }

// Machado et al. 2009 (severity 1.0), applied in linear RGB.
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
function simulate(h, kind) {
  const m = CVD[kind]; if (!m) return h;
  const c = hex(h).map(lin);
  const out = m.map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])));
  return '#' + out.map((x) => gam(x).toString(16).padStart(2, '0')).join('');
}
function lab(h) {
  const [r, g, b] = hex(h).map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const deltaE = (a, b) => { const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b); return Math.hypot(l1 - l2, a1 - a2, b1 - b2); };
const lightness = (h) => lab(h)[0];

/** How well can two status colours be told apart? Worst case over normal vision and the three kinds of colour blindness.
 *  `ok` when colour difference is clear (deltaE >= 25) in every view. Lightness difference is reported too: a pair that differs
 *  mostly in lightness still works for most colour-blind people, but we never rely on colour alone (icon + text are always shown). */
function distinguish(a, b) {
  const views = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'].map((k) => { const x = k === 'normal' ? a : simulate(a, k), y = k === 'normal' ? b : simulate(b, k); return { view: k, deltaE: deltaE(x, y), dL: Math.abs(lightness(x) - lightness(y)) }; });
  const worst = views.reduce((m, v) => (v.deltaE < m.deltaE ? v : m));
  return { views, worst, ok: worst.deltaE >= 25, lightnessOk: views.every((v) => v.dL >= 12) };
}
module.exports = { hex, luminance, contrast, simulate, deltaE, lightness, distinguish, CVD };

// ---- palette rules -------------------------------------------------------------------------------------------------
// P uses neutral names: text, muted, bg, surface, primary, primarySolid, danger, dangerSolid, success, and optionally
// successInk/successSoft, dangerInk/dangerSoft, warnInk/warnSoft and metric colours kcal/protein/water/steps.
const TEXT_MIN = 4.5, GRAPHIC_MIN = 3, LIGHTNESS_GAP = 10;
function checkPalette(P) {
  const out = [];
  const add = (rule, value, need, ok = value >= need) => out.push({ rule, value: Math.round(value * 100) / 100, need, ok });
  const has = (...k) => k.every((x) => P[x]);
  for (const bg of ['bg', 'surface']) for (const fg of ['text', 'muted', 'primary']) if (has(fg, bg)) add(`text: ${fg} on ${bg}`, contrast(P[fg], P[bg]), TEXT_MIN);
  for (const k of ['success', 'danger']) if (has(k, 'surface')) add(`text: ${k}Ink on ${k}Soft`, has(k + 'Ink', k + 'Soft') ? contrast(P[k + 'Ink'], P[k + 'Soft']) : 99, TEXT_MIN);
  if (has('warnInk', 'warnSoft')) add('text: warnInk on warnSoft', contrast(P.warnInk, P.warnSoft), TEXT_MIN);
  if (has('primarySolid')) add('button: white on primarySolid', contrast('#ffffff', P.primarySolid), TEXT_MIN);
  if (has('dangerSolid')) add('button: white on dangerSolid', contrast('#ffffff', P.dangerSolid), TEXT_MIN);
  for (const k of ['success', 'danger', 'primary', 'kcal', 'protein', 'water', 'steps']) if (has(k, 'surface')) add(`graphic: ${k} on surface`, contrast(P[k], P.surface), GRAPHIC_MIN);
  if (has('danger')) add('danger as text on surface', contrast(P.danger, P.surface), TEXT_MIN);
  if (has('success', 'danger')) {
    const d = distinguish(P.success, P.danger);
    add('status: success vs danger differ in lightness (all colour-vision types)', Math.min(...d.views.map((v) => v.dL)), LIGHTNESS_GAP);
  }
  return out;
}
const failures = (P) => checkPalette(P).filter((r) => !r.ok);
// Pull `--name: #hex` tokens out of CSS blocks whose selector matches `sel`.
function cssTokens(css, sel) {
  const out = {};
  const re = new RegExp(`(?:^|\\n)\\s*(${sel})\\s*\\{([^}]*)\\}`, 'g');
  let m; while ((m = re.exec(css))) for (const t of m[2].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)) out[t[1]] = t[2];
  return out;
}
module.exports.checkPalette = checkPalette; module.exports.failures = failures; module.exports.cssTokens = cssTokens;
module.exports.THRESHOLDS = { TEXT_MIN, GRAPHIC_MIN, LIGHTNESS_GAP };
