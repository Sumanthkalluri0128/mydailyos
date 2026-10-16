// Forgiving food search: words in any order, partial words, plurals, typos, abbreviations ("chkn" -> chicken) and the
// regional-language aliases in foodAliases.js. Pure functions (no database) so they are easy to test and to reuse.
const { expandWord } = require('./foodAliases');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter(Boolean);
/** Cheap singular form so "eggs", "idlis", "chapatis", "berries" line up with the catalogue's wording. */
function stem(t) {
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && /(ches|shes|xes|oes)$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/** Edit distance (insert / delete / replace / swap of neighbours), giving up early once it exceeds `max`. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let c = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) c = Math.min(c, prev2[j - 2] + 1);
      cur[j] = c;
      if (c < rowMin) rowMin = c;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** True when the letters of q appear in order inside w and start with the same letter ("pnr" in "paneer"). */
function isSubsequence(q, w) {
  if (q.length < 3 || q[0] !== w[0] || w.length > q.length * 3) return false;
  let i = 0;
  for (const ch of w) if (ch === q[i] && ++i === q.length) return true;
  return false;
}

/** How well one typed word matches one word of a food name: 0 (no match) .. 100 (exact). */
function wordScore(q, w) {
  if (q === w || stem(q) === stem(w)) return 100;
  if (w.startsWith(q)) return q.length >= 2 ? 82 : 40;
  if (q.length >= 3 && w.startsWith(stem(q))) return 78;
  if (q.length >= 3 && w.includes(q)) return 56;
  if (q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    const d = Math.min(editDistance(q, w, max), editDistance(q, w.slice(0, q.length + 1), max));
    if (d <= max) return 48 - d * 4;
  }
  if (isSubsequence(q, w)) return 28;
  return 0;
}

/** Best score of a typed word (and its regional-language equivalents) against any word of the haystack. */
function bestScore(q, words) {
  let best = 0;
  const forms = expandWord(q);
  for (let f = 0; f < forms.length; f++) {
    const weight = f === 0 ? 1 : 0.92;
    for (const w of words) {
      const s = wordScore(forms[f], w) * weight;
      if (s > best) best = s;
      if (best >= 100) return best;
    }
  }
  return best;
}

/** Score one food for a query: { matched, total, score }. `matched` = how many typed words found something. */
function scoreFood(food, qTokens, raw) {
  const nameWords = tokens(food.name);
  const brandWords = tokens(food.brand);
  const compactName = nameWords.join('');
  let matched = 0, sum = 0;
  for (const q of qTokens) {
    let s = bestScore(q, nameWords);
    if (!s && brandWords.length) s = bestScore(q, brandWords) * 0.7;
    if (!s && q.length >= 4 && compactName.includes(q)) s = 40; // "masaladosa" typed as one word
    if (s > 0) { matched++; sum += s; }
  }
  let bonus = 0;
  const name = norm(food.name);
  if (name === raw) bonus += 80;
  else if (name.startsWith(raw)) bonus += 45;
  else if (qTokens.length && nameWords[0] && wordScore(qTokens[0], nameWords[0]) >= 78) bonus += 12;
  // matched words that sit next to each other, in the order typed, read as a phrase
  if (qTokens.length > 1 && name.includes(qTokens.join(' '))) bonus += 25;
  // a name with fewer extra words is the plainer, more likely food
  bonus -= Math.max(0, nameWords.length - qTokens.length) * 1.5;
  return { matched, total: qTokens.length, score: sum + bonus };
}

/**
 * Rank foods for what was typed. Foods containing every typed word come first; foods containing only some of the words
 * follow (so a half-remembered name still turns something up). `extra(food)` adds a bonus (favourites, own foods, ...).
 */
function searchFoods(foods, query, { limit = 40, extra = () => 0, partial = true } = {}) {
  const raw = norm(query).slice(0, 80);
  const qTokens = raw.split(' ').filter(Boolean).slice(0, 6);
  if (!qTokens.length) return [];
  const out = [];
  for (const f of foods) {
    const r = scoreFood(f, qTokens, raw);
    if (!r.matched) continue;
    if (!partial && r.matched < r.total) continue;
    out.push({ f, rank: (r.matched === r.total ? 10000 : r.matched * 1000) + r.score + extra(f) });
  }
  out.sort((a, b) => b.rank - a.rank || String(a.f.name).length - String(b.f.name).length);
  // a weak, accidental match (one fuzzy letter-pair) should not crowd out real ones
  const top = out.length ? out[0].rank : 0;
  const cut = top >= 10000 ? 10000 : 0;
  const kept = out.filter((x, i) => i < 3 || x.rank >= cut || (partial && x.rank >= top - 1500));
  return kept.slice(0, limit).map((x) => x.f);
}

module.exports = { searchFoods, scoreFood, wordScore, editDistance, norm, tokens, stem };
