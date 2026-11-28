import fs from 'fs';
import path from 'path';

// chars.ts imports the generated list, which uses require('*.webp'). Replace it with a small list that includes a real blocklisted id.
jest.mock('../../motion/stickerImages', () => {
  const s = (name: string) => ({ name, src: 1, w: 100, h: 100 });
  return { STK: {
    goku: { lift: [s('lift-0')], hype: [s('hype-0')], sport: [s('sport-0')] },
    naruto: { hype: [s('hype-0')] },
  } };
});
import blocklist from '../../motion/stickerBlocklist.json';
import { isBlocked, withoutBlocked } from '../../motion/stickerBlock';
import { pickSticker, stickerById, stickerFor, stickersOf } from '../../motion/chars';

const ids: string[] = (blocklist as any).ids;

test('the audit blocklisted the cut-off stickers', () => {
  expect(ids).toEqual(expect.arrayContaining(['goku/lift-0', 'jinwoo/peace-0', 'tanjiro/chill-1']));
});
test('pickSticker / stickerFor never return a blocklisted sticker, for any seed', () => {
  expect(isBlocked('goku', 'lift-0')).toBe(true);
  for (let seed = 0; seed < 40; seed++) {
    expect(pickSticker('goku', ['lift'], seed).name).not.toBe('lift-0');
    expect(stickerFor('goku', 'lift', seed).name).not.toBe('lift-0');
    expect(stickerFor('goku', 'powerup', seed).name).not.toBe('lift-0');
  }
});
test('lookups by id and by character skip blocklisted stickers', () => {
  expect(stickerById('goku/lift-0')).toBeUndefined();
  expect(stickerById('goku/hype-0')).toBeDefined();
  expect(stickersOf('goku').map((x) => x.name)).not.toContain('lift-0');
});
test('withoutBlocked drops a sticker and any category left empty', () => {
  const out = withoutBlocked({ a: { x: [{ name: 'x-0' }], y: [{ name: 'y-0' }, { name: 'y-1' }] } }, new Set(['a/x-0', 'a/y-1']));
  expect(out).toEqual({ a: { y: [{ name: 'y-0' }] } });
});
test('the generated list shipped in the app no longer mentions any blocklisted file', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../motion/stickerImages.ts'), 'utf8');
  for (const id of ids) expect(src).not.toContain(`stickers/${id}.webp`);
});
