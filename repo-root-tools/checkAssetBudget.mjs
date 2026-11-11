// Fails when a picture folder grows past its budget, so a big new file cannot slip in unnoticed.
//   node tools/checkAssetBudget.mjs           (run from the repo root; CI runs it)
// Also fails on a PNG/JPG over 400 KB inside a picture folder (use WebP for pictures).
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const MB = 1024 * 1024;
const budgets = [
  ['web/client/public/scenes', 9.5 * MB], ['web/client/public/stickers', 4.2 * MB], ['web/client/public/exercises', 1.4 * MB],
  ['mobile/MyDailyOSMobile/assets/stickers', 4.2 * MB], ['mobile/MyDailyOSMobile/assets/exercises', 1.4 * MB], ['mobile/MyDailyOSMobile/assets/scenes', 1.3 * MB],
  ['mobile/MyDailyOSMobile/assets/widget', 1.5 * MB],
];
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
let bad = 0;
for (const [dir, max] of budgets) {
  const files = walk(path.join(root, dir));
  const total = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  const over = total > max;
  console.log(`${over ? 'OVER ' : 'ok   '} ${dir}  ${(total / MB).toFixed(2)} MB of ${(max / MB).toFixed(1)} MB  (${files.length} files)`);
  if (over) bad++;
  for (const f of files) if (/\.(png|jpe?g)$/i.test(f) && fs.statSync(f).size > 400 * 1024 && !/widget[\\/]/.test(f)) { console.log(`  BIG ${path.relative(root, f)} is ${(fs.statSync(f).size / 1024).toFixed(0)} KB; convert to WebP`); bad++; }
}
process.exit(bad ? 1 : 0);
