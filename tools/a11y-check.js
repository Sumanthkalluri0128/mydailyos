#!/usr/bin/env node
// node tools/a11y-check.js [path-to-mobile/src/utils/theme.tsx]
// Prints contrast and colour-blind checks for the web and mobile palettes. Exit code 1 when something fails.
const fs = require("fs"); const path = require("path");
const A = require("../server/lib/a11y");
const css = ["App.css", "styles/redesign.css"].map((f) => fs.readFileSync(path.join(__dirname, "..", "client", "src", f), "utf8")).join("\n");
const web = (sel) => A.cssTokens(css, sel);
const light = web(":root"), dark = { ...light, ...web('(?::root)?\\[data-theme="dark"\\]') };
const norm = (t) => ({ text: t.text, muted: t["text-muted"], bg: t.bg, surface: t.surface, primary: t.primary, primarySolid: t["primary-solid"], danger: t.danger, dangerSolid: t["danger-solid"], success: t.success, kcal: t.kcal, protein: t.protein, water: t.water, steps: t.steps });
const sets = { "web light": norm(light), "web dark": norm({ ...light, ...dark }) };
const mobilePath = process.argv[2] || path.join(__dirname, "..", "..", "mobile", "src", "utils", "theme.tsx");
if (fs.existsSync(mobilePath)) {
  const src = fs.readFileSync(mobilePath, "utf8");
  const block = (name) => { const m = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`)); const o = {}; if (m) for (const t of m[1].matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{3,6})'/g)) o[t[1]] = t[2]; return o; };
  const m = (o) => ({ text: o.ink, muted: o.muted, bg: o.bg, surface: o.card, primary: o.primary, primarySolid: o.primarySolid, danger: o.danger, dangerSolid: o.dangerSolid, success: o.success, successInk: o.successInk, successSoft: o.successSoft, dangerInk: o.dangerInk, dangerSoft: o.dangerSoft, warnInk: o.warnInk, warnSoft: o.warnSoft, kcal: o.kcal, protein: o.protein, water: o.water, steps: o.steps });
  sets["mobile light"] = m(block("lightColors")); sets["mobile dark"] = m(block("darkColors"));
}
let bad = 0;
for (const [name, P] of Object.entries(sets)) {
  console.log(`\n== ${name}`);
  for (const r of A.checkPalette(P)) { console.log(`${r.ok ? "ok  " : "FAIL"} ${r.rule}: ${r.value} (need ${r.need})`); if (!r.ok) bad++; }
}
console.log(bad ? `\n${bad} check(s) failed` : "\nAll checks pass");
console.log("Note: status is never shown by colour alone (icon or text always goes with it).");
process.exit(bad ? 1 : 0);
