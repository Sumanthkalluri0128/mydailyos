// Works with no install: counts !important per CSS file and fails if one appears OUTSIDE the files that are allowed to have them
// (reduced-motion / calm mode / print / gentle-mode hide). stylelint (see web/client/.stylelintrc.json) is the fuller check in CI.
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const dir = path.join(root, fs.existsSync(path.join(root, 'web/client/src')) ? 'web/client/src' : 'client/src');
const ALLOWED = {'components/coachcards.css': 1, 'components/home/home.css': 1, 'styles/redesign.css': 8, 'motion/base.css': 1, 'motion/fun.css': 1, 'motion/motion.css': 4};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.css$/.test(e.name) ? [path.join(d, e.name)] : []));
let bad = 0; let total = 0;
for (const f of walk(dir)) {
  const rel = path.relative(dir, f).replace(/\\/g, '/');
  const n = (fs.readFileSync(f, 'utf8').match(/!important/g) || []).length; total += n;
  const max = ALLOWED[rel] || 0;
  if (n > max) { console.log(`TOO MANY  ${rel}: ${n} !important (allowed ${max})`); bad += 1; }
}
console.log(`!important in total: ${total} (only reduced-motion, print and gentle-mode rules may use it)`);
process.exit(bad ? 1 : 0);
