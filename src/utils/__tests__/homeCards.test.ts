// The phone Home card math at the widths that caused the old sticker bugs (320, 360, 412, 640+ px wide screens).
// Same numbers as StatCard.tsx: card = min(screen, 640) - 40, two cards per row with a 12 px gap.
import fs from 'fs';
import path from 'path';
import { fitSticker } from '../layoutSafe';

const half = (screen: number) => (Math.min(screen, 640) - 40 - 12) / 2;
const withPlus = (screen: number) => fitSticker(half(screen) - 16 - 98 - 8, 74, 28);
const plain = (screen: number) => fitSticker(half(screen) - 16 - 56 - 8);

describe('Home stat card sticker sizes', () => {
  it('360 px phone: water/steps sticker shrinks to ~32 px and is not hidden', () => {
    expect(withPlus(360)).toBeGreaterThanOrEqual(28);
    expect(withPlus(360)).toBeLessThanOrEqual(40);
    expect(plain(360)).toBeGreaterThanOrEqual(44);
  });
  it('very narrow 320 px phone: the ＋ sticker hides instead of overlapping the ＋', () => {
    expect(withPlus(320)).toBe(0);
    expect(plain(320)).toBeGreaterThan(0);
  });
  it('larger screens: full-size stickers', () => {
    expect(withPlus(412)).toBeGreaterThanOrEqual(40);
    expect(withPlus(1280)).toBe(74);
    expect(plain(1280)).toBe(74);
  });
});

describe('Home uses the shared StatCard', () => {
  const home = fs.readFileSync(path.join(__dirname, '../../app/(tabs)/index.tsx'), 'utf8');
  it('renders all four stat cards through StatCard and keeps no per-card sticker maths', () => {
    expect(home.match(/<StatCard /g)).toHaveLength(4);
    expect(home).not.toMatch(/pkPlus|pkPlain|fitSticker/);
  });
});
