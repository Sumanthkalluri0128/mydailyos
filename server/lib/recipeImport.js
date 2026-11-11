// Turns a recipe web page (schema.org JSON-LD) or pasted recipe text into { name, servings, ingredients[], steps[] }.
// Pure functions (no network, no database). The route feeds `ingredients` to parseIngredients, which matches your food database.
const FRACTIONS = { '¼': '.25', '½': '.5', '¾': '.75', '⅓': '.333', '⅔': '.667', '⅛': '.125', '⅜': '.375', '⅝': '.625', '⅞': '.875' };
const decode = (s) => String(s == null ? '' : s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (s) => decode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "1 1/2 cups", "1½ cups", "½ tsp" -> "1.5 cups", ".5 tsp" -> "0.5 tsp". Leaves everything else alone. */
function normaliseQuantities(line) {
  let s = String(line || '');
  s = s.replace(/(\d)\s*([¼½¾⅓⅔⅛⅜⅝⅞])/g, (_, a, f) => `${Number(a) + Number(FRACTIONS[f])}`);
  s = s.replace(/([¼½¾⅓⅔⅛⅜⅝⅞])/g, (_, f) => `0${FRACTIONS[f]}`);
  s = s.replace(/(\d+)\s+(\d+)\/(\d+)/g, (m, a, b, c) => (Number(c) ? `${Math.round((Number(a) + Number(b) / Number(c)) * 100) / 100}` : m));
  s = s.replace(/(^|[^\d.])(\d+)\/(\d+)/g, (m, pre, b, c) => (Number(c) ? `${pre}${Math.round((Number(b) / Number(c)) * 100) / 100}` : m));
  return s.replace(/\s+/g, ' ').trim();
}

/** recipeYield can be 4, "4", "4 servings", ["4", "4 servings"], "Makes 12 cookies". First number wins. */
function parseYield(y) {
  const flat = Array.isArray(y) ? y.join(' ') : String(y == null ? '' : y);
  const m = flat.match(/(\d+(?:\.\d+)?)/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 0.25 && n <= 200 ? n : null;
}

const isRecipeType = (t) => (Array.isArray(t) ? t : [t]).some((x) => String(x || '').toLowerCase() === 'recipe');
function findRecipeNode(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipeNode(n, depth + 1); if (r) return r; } return null; }
  if (typeof node !== 'object') return null;
  if (isRecipeType(node['@type'])) return node;
  if (node['@graph']) return findRecipeNode(node['@graph'], depth + 1);
  for (const k of Object.keys(node)) { if (typeof node[k] === 'object') { const r = findRecipeNode(node[k], depth + 1); if (r) return r; } }
  return null;
}

function stepsFrom(instr) {
  if (!instr) return [];
  if (typeof instr === 'string') return strip(instr).split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean).slice(0, 40);
  if (Array.isArray(instr)) return instr.flatMap((s) => (typeof s === 'string' ? [strip(s)] : s && s.itemListElement ? stepsFrom(s.itemListElement) : s && (s.text || s.name) ? [strip(s.text || s.name)] : [])).filter(Boolean).slice(0, 40);
  return [];
}

/** @returns {{name, servings, ingredients: string[], steps: string[]} | null} */
function extractRecipeFromHtml(html) {
  const blocks = [...String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let json; try { json = JSON.parse(b[1].trim()); } catch { continue; }
    const r = findRecipeNode(json);
    if (!r) continue;
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : []).map((x) => normaliseQuantities(strip(x))).filter(Boolean).slice(0, 60);
    if (!ingredients.length) continue;
    return { name: strip(r.name).slice(0, 100) || 'Imported recipe', servings: parseYield(r.recipeYield), ingredients, steps: stepsFrom(r.recipeInstructions) };
  }
  return null;
}

const HEAD_ING = /^\s*(?:ingredients?|what you(?:'ll| will)? need|you(?:'ll| will)? need)\s*:?\s*$/i;
const HEAD_STEP = /^\s*(?:method|directions?|instructions?|steps?|preparation|procedure|how to make)\s*:?\s*$/i;
const SERVES = /(?:serves|servings?|makes|yield|portions?)\s*:?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:servings?|portions?|people)\b/i;
const QTY_START = /^\s*(?:[-*•·]\s*)?(?:\d|[¼½¾⅓⅔⅛]|a\s+(?:pinch|handful|few)|one|two|three|half)\b/i;

/** Pasted text: title on the first line, "Serves 4", an "Ingredients" part and a "Method" part. Without headings, lines that start with an amount are the ingredients. */
function extractRecipeFromText(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  let servings = null; let name = '';
  const first = lines[0];
  if (!HEAD_ING.test(first) && !QTY_START.test(first) && first.length <= 100) name = first.replace(/^#+\s*/, '');
  const ings = []; const steps = []; let mode = null;
  for (const l of lines) {
    if (HEAD_ING.test(l)) { mode = 'ing'; continue; }
    if (HEAD_STEP.test(l)) { mode = 'step'; continue; }
    const sv = l.match(SERVES);
    if (sv && servings == null && l.length < 60) { servings = parseYield(sv[1] || sv[2]); continue; }
    if (l === name) continue;
    if (mode === 'ing') ings.push(l);
    else if (mode === 'step') steps.push(l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, ''));
    else if (QTY_START.test(l)) ings.push(l);
  }
  const ingredients = ings.map((l) => normaliseQuantities(l.replace(/^[-*•·]\s*/, ''))).filter(Boolean).slice(0, 60);
  if (!ingredients.length) return null;
  return { name: name || 'Imported recipe', servings, ingredients, steps: steps.slice(0, 40) };
}

const htmlToText = (h) => decode(String(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|li|div|h[1-6]|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');
/** Reads whatever was pasted: a page's HTML (JSON-LD first), or plain recipe text. */
function extractRecipe(input) {
  const s = String(input || '');
  if (/<script[^>]*ld\+json/i.test(s)) { const r = extractRecipeFromHtml(s); if (r) return r; }
  return extractRecipeFromText(/<[a-z][\s\S]*>/i.test(s) ? htmlToText(s) : s);
}

/** Scale ingredient quantities for a different number of servings. Macros PER SERVING do not change; totals do. */
function scaleQuantity(q, from, to) {
  const f = Number(from), t = Number(to), n = Number(q);
  if (!(f > 0) || !(t > 0) || !Number.isFinite(n)) return n;
  const out = (n * t) / f;
  return out >= 100 ? Math.round(out) : Math.round(out * 10) / 10;
}
/** Scale the leading amount of a text line: "2 cups rice" x 2 -> "4 cups rice". */
function scaleLine(line, from, to) {
  const s = normaliseQuantities(line);
  return s.replace(/^(\d+(?:\.\d+)?)/, (_, n) => String(scaleQuantity(Number(n), from, to)));
}

module.exports = { normaliseQuantities, parseYield, extractRecipeFromHtml, extractRecipeFromText, extractRecipe, scaleQuantity, scaleLine };
