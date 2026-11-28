// Finds phone buttons a screen reader cannot name. A TouchableOpacity / Pressable is fine when it has an accessibilityLabel
// OR visible text inside it (the reader speaks the text). It is a PROBLEM when it has neither (an icon-only button).
//   node tools/auditA11y.mjs            report
//   node tools/auditA11y.mjs --check    exit 1 when the number of problems is above the budget in tools/a11yBudget.json (CI)
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' || e.name === '__tests__' ? [] : walk(path.join(d, e.name))) : /\.tsx$/.test(e.name) ? [path.join(d, e.name)] : []));
const files = walk(path.join(root, 'src'));
let total = 0; let labelled = 0; let hasText = 0; const problems = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /<(TouchableOpacity|Pressable|TouchableHighlight)\b/g; let m;
  while ((m = re.exec(src))) {
    const start = m.index; const tag = m[1];
    // opening tag end (first '>' not inside braces)
    let depth = 0; let i = start; let end = -1;
    for (; i < src.length; i += 1) { const ch = src[i]; if (ch === '{') depth += 1; else if (ch === '}') depth -= 1; else if (ch === '>' && depth === 0 && src[i - 1] !== '=') { end = i; break; } }
    if (end < 0) continue;
    const open = src.slice(start, end + 1); total += 1;
    const selfClosing = open.endsWith('/>');
    const close = selfClosing ? end : src.indexOf(`</${tag}>`, end);
    const inner = selfClosing || close < 0 ? '' : src.slice(end + 1, close);
    const label = /accessibilityLabel=/.test(open); const aria = /accessible=\{false\}/.test(open);
    const text = /<Text\b|<Btn\b|<Chip\b|<Button\b/.test(inner);                // visible words inside = the reader speaks them
    if (label) labelled += 1; if (text) hasText += 1;
    if (!label && !text && !aria) problems.push(`${path.relative(root, f)}:${src.slice(0, start).split('\n').length}`);
  }
}
const budgetFile = path.join(root, 'tools/a11yBudget.json');
const budget = fs.existsSync(budgetFile) ? JSON.parse(fs.readFileSync(budgetFile, 'utf8')).maxUnlabelledIconButtons : 0;
console.log(`pressables: ${total}   with a label: ${labelled}   with visible text: ${hasText}   icon-only and unlabelled: ${problems.length}  (budget ${budget})`);
for (const p of problems) console.log('  NO NAME  ' + p);
if (process.argv.includes('--check') && problems.length > budget) { console.log('More unlabelled icon-only buttons than the budget. Add an accessibilityLabel.'); process.exit(1); }
