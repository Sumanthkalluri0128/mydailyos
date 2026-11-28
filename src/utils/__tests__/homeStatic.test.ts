import fs from 'fs';
import path from 'path';
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

test('Home has no carousel or blurred scene banner (only the hero scene rotates on a timer)', () => {
  for (const f of ['app/(tabs)/index.tsx', 'components/home/HeroCard.tsx', 'utils/dailyLine.ts']) {
    const src = read(f);
    expect(src).not.toMatch(/pagingEnabled|blurRadius|FlatList|AUTO_MS|scrollToIndex/);
    if (f !== 'components/home/HeroCard.tsx') expect(src).not.toMatch(/setInterval/); // only the hero rotates its scene
  }
  expect(fs.existsSync(path.join(__dirname, '../../components/home/HeroCarousel.tsx'))).toBe(false);
  expect(fs.existsSync(path.join(__dirname, '../../components/MotivationCarousel.tsx'))).toBe(false);
});

test('the weekly review card starts collapsed every time and remembers nothing between launches', () => {
  const src = read('components/OverDayCard.tsx');
  expect(src).toMatch(/const \[open, setOpen\] = useState\(false\)/);
  expect(src).not.toMatch(/AsyncStorage|ff_overday_min/);
});

test('every body-weight value on Home goes through WeightReveal', () => {
  const src = read('app/(tabs)/index.tsx');
  expect(src).toMatch(/<WeightReveal[^>]*wShow\(cw\)/);
  expect(src).toMatch(/<WeightReveal[^>]*to go · target/);
});
