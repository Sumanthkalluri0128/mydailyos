// Files that must stay identical between the web app and the phone app. Run from the folder that holds web/ and mobile/.
//   node tools/checkSharedFiles.mjs      exit 1 when something drifted
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const W = path.join(root, 'web/client/src'), M = path.join(root, 'mobile/MyDailyOSMobile/src');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const dropNoCheck = (s) => s.replace(/^\/\/ @ts-nocheck\n/, '');
const failures = [];

// 1. byte-for-byte shared code
for (const [web, phone, strip] of [
  ['utils/exerciseFigure.js', 'utils/exerciseFigure.ts', dropNoCheck],
  ['utils/training.js', 'utils/training.js', (s) => s],
]) {
  const a = read(path.join(W, web)), b = strip(read(path.join(M, phone)));
  console.log(`${a === b ? 'same ' : 'DIFF '} ${web}  <->  ${phone}`);
  if (a !== b) failures.push(web);
}

// 2. the exercise photo map: the phone's file is generated from the web file, so its rows must equal the web rows (plus the phone-only names)
const webSrc = read(path.join(W, 'data/exerciseImages.js'));
const webRows = Function(`"use strict"; return ${webSrc.match(/const ROWS = (\[[\s\S]*?\n\]);/)[1]};`)();
const phoneRows = JSON.parse(read(path.join(M, 'data/exerciseImages.ts')).match(/ROWS: \[string.*?\] = (\[[\s\S]*?\n\]);/)[1]);
let ok = webRows.length === phoneRows.length;
for (const [i, r] of webRows.entries()) {
  const p = phoneRows[i];
  if (!p || p[0] !== r[0] || p[1] !== r[1] || JSON.stringify(p[3]) !== JSON.stringify(r[3]) || !r[2].every((n) => p[2].includes(n))) ok = false;
}
console.log(`${ok ? 'same ' : 'DIFF '} data/exerciseImages (rows, tips, files)  -> if DIFF run: node tools/syncExerciseImages.mjs  (in mobile/MyDailyOSMobile)`);
if (!ok) failures.push('exerciseImages');

// 3. the photo files themselves
const wDir = path.join(root, 'web/client/public/exercises'), mDir = path.join(root, 'mobile/MyDailyOSMobile/assets/exercises');
const wf = fs.readdirSync(wDir).sort(), mf = fs.readdirSync(mDir).sort();
const same = wf.length === mf.length && wf.every((f, i) => f === mf[i] && fs.statSync(path.join(wDir, f)).size === fs.statSync(path.join(mDir, f)).size);
console.log(`${same ? 'same ' : 'DIFF '} exercise photo files (${wf.length} web / ${mf.length} phone)`);
if (!same) failures.push('photo files');

process.exit(failures.length ? 1 : 0);
