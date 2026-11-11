const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/recipeImport');
const F = require('../lib/safeFetch');

const page = (obj) => `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body>x</body></html>`;

test('page with schema.org Recipe (inside @graph): name, servings, ingredients, steps', () => {
  const r = R.extractRecipeFromHtml(page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite' }, { '@type': ['Recipe', 'Thing'], name: 'Dal &amp; Rice', recipeYield: ['4', '4 servings'],
    recipeIngredient: ['1 1/2 cups toor dal', '½ tsp turmeric', '2 tbsp ghee'], recipeInstructions: [{ '@type': 'HowToStep', text: 'Boil the dal.' }, { '@type': 'HowToSection', itemListElement: [{ text: 'Temper with ghee.' }] }] }] }));
  assert.equal(r.name, 'Dal & Rice'); assert.equal(r.servings, 4);
  assert.deepEqual(r.ingredients, ['1.5 cups toor dal', '0.5 tsp turmeric', '2 tbsp ghee']);
  assert.deepEqual(r.steps, ['Boil the dal.', 'Temper with ghee.']);
});
test('page without a recipe, or with broken JSON, gives null (never throws)', () => {
  assert.equal(R.extractRecipeFromHtml('<html>nothing</html>'), null);
  assert.equal(R.extractRecipeFromHtml('<script type="application/ld+json">{oops</script>'), null);
  assert.equal(R.extractRecipeFromHtml(page({ '@type': 'Recipe', name: 'No ingredients' })), null);
});
test('pasted text with headings', () => {
  const r = R.extractRecipeFromText('Veg Pulao\nServes 4\n\nIngredients\n2 cups basmati rice\n1 onion, sliced\n2 tbsp oil\n\nMethod\n1. Fry the onion.\n2. Add rice and water.');
  assert.equal(r.name, 'Veg Pulao'); assert.equal(r.servings, 4);
  assert.deepEqual(r.ingredients, ['2 cups basmati rice', '1 onion, sliced', '2 tbsp oil']);
  assert.deepEqual(r.steps, ['Fry the onion.', 'Add rice and water.']);
});
test('pasted text without headings: lines that start with an amount are the ingredients', () => {
  const r = R.extractRecipeFromText('Quick oats\nMakes 2 servings\n1 cup oats\n2 cups milk\nStir and cook for five minutes.');
  assert.deepEqual(r.ingredients, ['1 cup oats', '2 cups milk']); assert.equal(r.servings, 2);
  assert.equal(R.extractRecipeFromText('just some words, no amounts'), null);
});
test('extractRecipe reads HTML (json-ld or plain markup) and plain text', () => {
  assert.equal(R.extractRecipe(page({ '@type': 'Recipe', name: 'A', recipeIngredient: ['1 cup rice'] })).name, 'A');
  assert.deepEqual(R.extractRecipe('<h1>Soup</h1><h2>Ingredients</h2><ul><li>2 cups water</li><li>1 tsp salt</li></ul>').ingredients, ['2 cups water', '1 tsp salt']);
  assert.deepEqual(R.extractRecipe('Pasta\nIngredients\n200 g pasta').ingredients, ['200 g pasta']);
});
test('fractions and yields', () => {
  assert.equal(R.normaliseQuantities('1½ cups milk'), '1.5 cups milk');
  assert.equal(R.normaliseQuantities('3/4 cup sugar'), '0.75 cup sugar');
  assert.equal(R.normaliseQuantities('1 1/4 cups flour'), '1.25 cups flour');
  assert.equal(R.parseYield('Makes 12 cookies'), 12); assert.equal(R.parseYield(6), 6); assert.equal(R.parseYield('lots'), null); assert.equal(R.parseYield('0'), null);
});
test('servings scaling: quantities scale, text lines scale their first number', () => {
  assert.equal(R.scaleQuantity(200, 4, 2), 100); assert.equal(R.scaleQuantity(1.5, 2, 3), 2.3); assert.equal(R.scaleQuantity(333, 3, 2), 222);
  assert.equal(R.scaleQuantity(5, 0, 2), 5);
  assert.equal(R.scaleLine('2 cups rice', 4, 8), '4 cups rice'); assert.equal(R.scaleLine('½ tsp salt', 2, 4), '1 tsp salt'); assert.equal(R.scaleLine('salt to taste', 2, 4), 'salt to taste');
});

test('safe fetch: private, loopback, link-local and metadata addresses are blocked', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::ffff:10.0.0.1', 'fd00::1', 'fe80::1', '224.0.0.1']) assert.equal(F.isBlockedIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(F.isBlockedIp(ip), false, ip);
});
test('safe fetch: only public http(s) links', async () => {
  const pub = async () => [{ address: '93.184.216.34' }];
  const priv = async () => [{ address: '10.0.0.5' }];
  await assert.rejects(F.assertPublicUrl('ftp://x.com/a', pub), /Only http/);
  await assert.rejects(F.assertPublicUrl('file:///etc/passwd', pub), /Only http/);
  await assert.rejects(F.assertPublicUrl('not a url', pub), /web link/);
  await assert.rejects(F.assertPublicUrl('http://localhost:3000/', pub), /not allowed/);
  await assert.rejects(F.assertPublicUrl('http://169.254.169.254/latest/meta-data', pub), /not allowed/);
  await assert.rejects(F.assertPublicUrl('https://evil.example/', priv), /not allowed/);   // a public-looking name that points inside
  await assert.rejects(F.assertPublicUrl('https://user:pw@x.com/', pub), /username/);
  assert.equal((await F.assertPublicUrl('https://example.com/r', pub)).hostname, 'example.com');
});
test('safe fetch: a redirect to a private address is refused, and big pages are cut off', async () => {
  const lookup = async (h) => [{ address: h === 'inner.example' ? '10.0.0.9' : '93.184.216.34' }];
  const redirecting = async () => ({ status: 302, ok: false, headers: new Map([['location', 'http://inner.example/admin']]) });
  await assert.rejects(F.fetchPage('https://ok.example/', { lookup, fetchImpl: redirecting }), /not allowed/);
  const big = async () => ({ status: 200, ok: true, headers: new Map([['content-type', 'text/html']]), body: { getReader: () => { let n = 0; return { read: async () => (n++ < 4 ? { done: false, value: Buffer.alloc(500000) } : { done: true }), cancel: async () => {} }; } } });
  await assert.rejects(F.fetchPage('https://ok.example/', { lookup, fetchImpl: big }), /too large/);
  const small = async () => ({ status: 200, ok: true, headers: new Map([['content-type', 'text/html; charset=utf-8']]), text: async () => '<p>hi</p>' });
  assert.equal(await F.fetchPage('https://ok.example/', { lookup, fetchImpl: small }), '<p>hi</p>');
  const json = async () => ({ status: 200, ok: true, headers: new Map([['content-type', 'application/json']]), text: async () => '{}' });
  await assert.rejects(F.fetchPage('https://ok.example/', { lookup, fetchImpl: json }), /not a web page/);
});
