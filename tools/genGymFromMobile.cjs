const ts = require('../MyDailyOSMobile-v62/node_modules/typescript');
const fs = require('fs');
const src = '../MyDailyOSMobile-v62/src/utils/', dst = '../client/src/utils/';
for (const f of ['gymMath', 'gymClean', 'gymExport', 'gymCatalog']) {
  let t = fs.readFileSync(src + f + '.ts', 'utf8');
  if (f === 'gymExport') t = t.replace("import { KG_PER_LB } from './units';", "const KG_PER_LB = 0.45359237;");
  const out = ts.transpileModule(t, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, removeComments: false, importsNotUsedAsValues: 'remove' } }).outputText;
  fs.writeFileSync(dst + f + '.js', `// GENERATED from MyDailyOSMobile/src/utils/${f}.ts (the typed source of truth). Edit that file, then re-run the generator; do not edit this copy.\n` + out);
}
console.log('ok');
