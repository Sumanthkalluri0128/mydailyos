// Spoken text -> text the meal parser understands. The speech-to-text itself runs on the device (nothing is sent to a paid service);
// this only tidies what it heard: number words (English / Hindi / Telugu / Tamil), filler ("maine khaya", "I had"), "and" words,
// a few common food words written in Devanagari / Telugu / Tamil script, and "for lunch" -> which meal.
// Foods it does not know stay as typed and show up as "couldn't find" in the review: nothing is guessed.
const NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  // Hindi (Latin) / Devanagari
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10, aadha: 0.5, adha: 0.5, dedh: 1.5, dhai: 2.5,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'आधा': 0.5, 'डेढ़': 1.5, 'ढाई': 2.5,
  // Telugu
  okati: 1, rendu: 2, moodu: 3, naalugu: 4, aidu: 5, aaru: 6, edu: 7, enimidi: 8, tommidi: 9, padi: 10,
  'ఒకటి': 1, 'రెండు': 2, 'మూడు': 3, 'నాలుగు': 4, 'ఐదు': 5,
  // Tamil
  onru: 1, irandu: 2, moondru: 3, naangu: 4, ainthu: 5, aindhu: 5,
  'ஒன்று': 1, 'இரண்டு': 2, 'மூன்று': 3, 'நான்கு': 4, 'ஐந்து': 5,
};
const DIGITS = { '०': 0, '१': 1, '२': 2, '३': 3, '४': 4, '५': 5, '६': 6, '७': 7, '८': 8, '९': 9, '౦': 0, '౧': 1, '౨': 2, '౩': 3, '౪': 4, '౫': 5, '௦': 0, '௧': 1, '௨': 2, '௩': 3, '௪': 4, '௫': 5 };
const FOOD = {
  'रोटी': 'roti', 'चपाती': 'roti', 'दाल': 'dal', 'चावल': 'rice', 'सब्जी': 'sabzi', 'दूध': 'milk', 'चाय': 'chai', 'कॉफी': 'coffee', 'पनीर': 'paneer', 'अंडा': 'egg', 'अंडे': 'egg', 'दही': 'curd', 'इडली': 'idli', 'डोसा': 'dosa', 'पराठा': 'paratha', 'पोहा': 'poha',
  'రోటీ': 'roti', 'పప్పు': 'dal', 'అన్నం': 'rice', 'పాలు': 'milk', 'టీ': 'chai', 'ఇడ్లీ': 'idli', 'దోశ': 'dosa', 'పెరుగు': 'curd', 'గుడ్డు': 'egg',
  'ரொட்டி': 'roti', 'பருப்பு': 'dal', 'சாதம்': 'rice', 'பால்': 'milk', 'டீ': 'chai', 'இட்லி': 'idli', 'தோசை': 'dosa', 'தயிர்': 'curd', 'முட்டை': 'egg',
};
const UNIT = { gilas: 'glass', glassful: 'glass', katoris: 'katori', katori: 'katori', chammach: 'tsp', chamach: 'tsp', pyala: 'cup', pyali: 'cup', cup: 'cup', cups: 'cup', plate: 'plate' };
const JOIN = new Set(['aur', 'और', 'mariyu', 'మరియు', 'matrum', 'மற்றும்', 'and', 'plus', 'phir', 'then']);
const FILLER = new Set(['maine', 'mene', 'mai', 'main', 'khaya', 'khayi', 'khaye', 'liya', 'li', 'piya', 'piyi', 'kha', 'diya', 'tha', 'thi', 'i', 'had', 'ate', 'eaten', 'drank', 'have', 'just', 'um', 'uh', 'please', 'for', 'liye', 'के', 'लिए', 'ka', 'ki', 'ke', 'mein', 'me', 'ko',
  'मैंने', 'खाया', 'खायी', 'पिया', 'लिया', 'का', 'की', 'के', 'में', 'నేను', 'తిన్నాను', 'తాగాను', 'நான்', 'சாப்பிட்டேன்', 'குடித்தேன்']);
const MEAL_WORDS = {
  breakfast: ['breakfast', 'nashta', 'nasta', 'naashta', 'subah', 'नाश्ता', 'सुबह', 'tiffin', 'అల్పాహారం', 'காலை'],
  lunch: ['lunch', 'dopahar', 'दोपहर', 'bhojan', 'మధ్యాహ్నం', 'மதியம்'],
  dinner: ['dinner', 'raat', 'रात', 'supper', 'రాత్రి', 'இரவு'],
  snacks: ['snack', 'snacks', 'shaam', 'शाम', 'evening', 'సాయంత్రం', 'மாலை'],
};
const LOCALES = [['en-IN', 'English'], ['hi-IN', 'हिन्दी'], ['te-IN', 'తెలుగు'], ['ta-IN', 'தமிழ்']];

/** @returns { text, meal } — meal is 'breakfast'|'lunch'|'dinner'|'snacks'|null (only when the person said it). */
function normalizeSpoken(input) {
  let s = String(input || '').slice(0, 600).toLowerCase().replace(/[।.!?]/g, ',');
  s = s.replace(/[०-९౦-౯௦-௯]/g, (d) => (DIGITS[d] !== undefined ? DIGITS[d] : d));
  let meal = null;
  const out = [];
  const words = s.split(/[\s]+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    const raw = words[i];
    const trail = /,$/.test(raw);
    const w = raw.replace(/,+$/, '');
    if (!w) { if (trail) out.push(','); continue; }
    const mealHit = Object.keys(MEAL_WORDS).find((m) => MEAL_WORDS[m].includes(w));
    if (mealHit) { meal = meal || mealHit; if (trail) out.push(','); continue; }
    if (JOIN.has(w)) { out.push(','); continue; }
    if (FILLER.has(w)) { if (trail) out.push(','); continue; }
    let t = NUM[w] !== undefined ? String(NUM[w]) : FOOD[w] || UNIT[w] || w;
    // "one and a half" / "ek aur aadha" -> 1.5
    if (/^\d+$/.test(t) && JOIN.has(words[i + 1] || '') && (words[i + 2] === 'a' && words[i + 3] === 'half' || NUM[words[i + 2]] === 0.5)) { t = String(Number(t) + 0.5); i += words[i + 2] === 'a' ? 3 : 2; }
    out.push(t);
    if (trail) out.push(',');
  }
  const text = out.join(' ').replace(/\s*,\s*(,\s*)+/g, ', ').replace(/\s+,/g, ',').replace(/^[,\s]+|[,\s]+$/g, '').replace(/\s+/g, ' ');
  return { text, meal };
}

module.exports = { normalizeSpoken, LOCALES };
