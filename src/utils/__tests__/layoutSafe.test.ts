import { bubbleOffset, ceilingY, fitSticker } from '../layoutSafe';

test('a corner sticker that does not fit is hidden, never cropped', () => {
  // 360 px phone: the stat cards are 154 px wide; water/steps have a ＋ button leaving a 32 px slot
  const half = (360 - 40 - 12) / 2;
  expect(fitSticker(half - 16 - 98 - 8, 74, 28)).toBe(32);   // water / steps on a 360 px phone: small, but shown
  expect(fitSticker(half - 16 - 56 - 8)).toBe(74);         // exercise / weight: full size
  expect(fitSticker(60)).toBe(60);                         // shrinks to the slot
  expect(fitSticker(43)).toBe(0);
});

test('speech bubbles stay 8 px inside the screen on a 360 px phone', () => {
  for (const x of [0, 30, 140, 280]) {
    const left = bubbleOffset(x, 360, 80, 220);
    expect(x + left).toBeGreaterThanOrEqual(8);
    expect(x + left + 220).toBeLessThanOrEqual(360 - 8);
  }
  expect(bubbleOffset(140, 360, 80, 220)).toBe(-70);       // centred when there is room
});

test('floating characters stop below the status bar', () => {
  expect(ceilingY(800, 74, 30, 80)).toBe(800 - 74 - 80 - 30 - 8);
  expect(ceilingY(100, 74, 30, 80)).toBe(0);
});
