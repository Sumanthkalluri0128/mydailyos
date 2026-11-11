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
const NOCHECK = '// @ts-nocheck\n';
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
// [source file, web copy, phone copy, text added to the top of the phone copy]
const FILES = [
  ['exerciseFigure.js', 'utils/exerciseFigure.js', 'utils/exerciseFigure.ts', NOCHECK],
  ['training.js', 'utils/training.js', 'utils/training.js', ''],
  ['coneGeometry.js', 'utils/coneGeometry.js', 'utils/coneGeometry.ts', NOCHECK],
  ...['en', 'hi', 'ta', 'te'].map((l) => [`i18n/${l}.json`, `i18n/${l}.json`, `i18n/${l}.json`, '']),
];
let bad = 0;
for (const [name, web, phone, top] of FILES) {
  const src = read(path.join(SRC, name));
  if (/\bfrom\s+['"](react|react-native)['"]|require\(['"](react|react-native)['"]\)/.test(src)) { console.log(`REFUSED  ${name} imports react: shared code must be framework-free`); bad += 1; continue; }
  for (const [base, rel, prefix] of [[W, web, ''], [M, phone, top]]) {
    const target = path.join(base, rel); const want = prefix + src;
    const have = fs.existsSync(target) ? read(target) : null;
    if (have === want) { console.log(`same  ${rel}`); continue; }
    if (check) { console.log(`DIFF  ${path.relative(root, target)} (edit packages/shared/src/${name} instead, then run: node tools/syncShared.mjs)`); bad += 1; } else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, want); console.log(`wrote ${path.relative(root, target)}`); }
  }
}
process.exit(bad ? 1 : 0);
