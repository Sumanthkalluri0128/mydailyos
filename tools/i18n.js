#!/usr/bin/env node
// Translation helper for people who are not developers.
//   node tools/i18n.js export hi      -> writes hi.csv  (key, english, translation) to open in Excel / Sheets
//   node tools/i18n.js import hi.csv  -> merges the corrected "translation" column back into src/i18n/hi.json
//   node tools/i18n.js check          -> lists missing keys and placeholder mismatches per language
//   node tools/i18n.js reviewed hi    -> after a native speaker has checked it: sets needsReview=false
const fs = require("fs"); const path = require("path");
const DIR = path.join(__dirname, "..", "client", "src", "i18n");
const load = (l) => JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), "utf8"));
const save = (l, d) => fs.writeFileSync(path.join(DIR, `${l}.json`), JSON.stringify(d, null, 1) + "\n");
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
function parseCsv(text) {
  const rows = []; let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
    else if (c === '"') inQ = true; else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const [cmd, arg] = process.argv.slice(2);
if (cmd === "export" && arg) {
  const en = load("en"), d = load(arg);
  const lines = ["key,english,translation"];
  for (const k of Object.keys(en).filter((x) => !x.startsWith("_"))) lines.push([q(k), q(en[k]), q(d[k] || "")].join(","));
  fs.writeFileSync(`${arg}.csv`, "﻿" + lines.join("\n") + "\n"); console.log(`wrote ${arg}.csv`);
} else if (cmd === "import" && arg) {
  const lang = path.basename(arg).replace(/\.csv$/, ""); const en = load("en"), d = load(lang);
  const rows = parseCsv(fs.readFileSync(arg, "utf8").replace(/^﻿/, "")).slice(1); let n = 0, bad = 0;
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
  for (const [k, , tr] of rows) {
    if (!(k in en) || !tr) continue;
    if (ph(tr) !== ph(en[k])) { console.log(`skipped ${k}: placeholders must match English (${ph(en[k]) || "none"})`); bad++; continue; }
    if (d[k] !== tr) { d[k] = tr; n++; }
  }
  save(lang, d); console.log(`updated ${n} strings in ${lang}.json${bad ? `, ${bad} skipped` : ""}`);
} else if (cmd === "check") {
  const en = load("en");
  for (const l of ["hi", "te", "ta"]) {
    const d = load(l); const keys = Object.keys(en).filter((k) => !k.startsWith("_") && !k.startsWith("lang."));
    const miss = keys.filter((k) => !d[k]);
    console.log(`${l}: ${keys.length - miss.length}/${keys.length} translated${d._meta?.needsReview ? " (needs native review)" : ""}`, miss.length ? "missing: " + miss.join(", ") : "");
  }
} else if (cmd === "reviewed" && arg) { const d = load(arg); d._meta.needsReview = false; save(arg, d); console.log(`${arg} marked reviewed`); }
else console.log("usage: node tools/i18n.js export <lang> | import <lang>.csv | check | reviewed <lang>");
