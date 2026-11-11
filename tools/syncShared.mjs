// One source (packages/shared/src), two copies (web and phone). Run from the repo root.
//   node tools/syncShared.mjs            write the copies
//   node tools/syncShared.mjs --check    fail if a copy differs from the source (someone edited a copy by hand)
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const check = process.argv.includes('--check');
const SRC = path.join(root, 'packages/shared/src');
const W = path.join(root, 'web/client/src');
const M = path.join(root, 'mobile/MyDailyOSMobile/src');
const S = path.join(root, 'web/server');
const NOCHECK = '// @ts-nocheck\n';
const BANNER = '// GENERATED from packages/shared/src/energy.js. Do not edit this copy: change the source, then run: node tools/syncShared.mjs\n';
// energy.js is the ONE calorie / macro / progress model. The server copy is CommonJS (the export block becomes module.exports).
const toCommonJs = (src) => src.replace(/\nexport \{([\s\S]*?)\};?\s*$/, (_, names) => `\nmodule.exports = {${names}};\n`);
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
// [source file, web copy, phone copy, text added to the top of the phone copy]
const FILES = [
  ['exerciseFigure.js', 'utils/exerciseFigure.js', 'utils/exerciseFigure.ts', NOCHECK],
  ['energy.js', 'utils/energy.js', 'utils/energy.ts', NOCHECK + BANNER + '__TYPES__', BANNER, 'lib/energy.js'],
  ['training.js', 'utils/training.js', 'utils/training.js', ''],
  ['coneGeometry.js', 'utils/coneGeometry.js', 'utils/coneGeometry.ts', NOCHECK],
  ...['en', 'hi', 'ta', 'te'].map((l) => [`i18n/${l}.json`, `i18n/${l}.json`, `i18n/${l}.json`, '']),
];
// Safety: a translation copy that has keys the shared source lacks is NEWER than the source. Never overwrite it (that would delete translations).
const flatKeys = (o, p = '') => Object.entries(o || {}).flatMap(([k, v]) => (v && typeof v === 'object' ? flatKeys(v, p + k + '.') : [p + k]));
function staleSource(name, src, target) {
  if (!name.endsWith('.json') || !fs.existsSync(target)) return 0;
  try { const have = new Set(flatKeys(JSON.parse(src))); return flatKeys(JSON.parse(read(target))).filter((k) => !have.has(k)).length; } catch { return 0; }
}
let bad = 0;
for (const [name, web, phone, top0, webTop = '', server = null] of FILES) {
  const top = top0.replace('__TYPES__', top0.includes('__TYPES__') ? read(path.join(SRC, 'energy.types.txt')) + '\n' : '');
  const src = read(path.join(SRC, name));
  if (/\bfrom\s+['"](react|react-native)['"]|require\(['"](react|react-native)['"]\)/.test(src)) { console.log(`REFUSED  ${name} imports react: shared code must be framework-free`); bad += 1; continue; }
  const targets = [[W, web, webTop, src], [M, phone, top, src]];
  if (server) targets.push([S, server, BANNER, toCommonJs(src)]);
  for (const [base, rel, prefix, text] of targets) {
    const target = path.join(base, rel); const want = prefix + text;
    const missing = staleSource(name, src, target);
    if (missing) { console.log(`REFUSED  ${path.relative(root, target)} has ${missing} keys the shared source lacks. Merge them into packages/shared/src/${name} first.`); bad += 1; continue; }
    const have = fs.existsSync(target) ? read(target) : null;
    if (have === want) { console.log(`same  ${rel}`); continue; }
    if (check) { console.log(`DIFF  ${path.relative(root, target)} (edit packages/shared/src/${name} instead, then run: node tools/syncShared.mjs)`); bad += 1; } else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, want); console.log(`wrote ${path.relative(root, target)}`); }
  }
}
process.exit(bad ? 1 : 0);
