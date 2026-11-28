// Placement helpers so characters and stickers are never cropped by a card edge, the screen edge or the tab bar.

/** Highest y (px above the floor) a floating character may reach so it stays below the status bar. */
export const ceilingY = (screenH: number, floor: number, insetTop: number, size: number, margin = 8): number =>
  Math.max(0, screenH - floor - size - insetTop - margin);

/** `left` for a speech bubble of `width` over a character at `x` (size `size`) so the bubble stays 8 px inside the screen. */
export function bubbleOffset(x: number, screenW: number, size: number, width: number, margin = 8): number {
  const w = Math.min(width, screenW - margin * 2);
  const centred = -((w - size) / 2);
  const minLeft = margin - x;                 // bubble's left edge no further left than the margin
  const maxLeft = screenW - margin - w - x;   // bubble's right edge no further right than the margin
  return Math.max(minLeft, Math.min(maxLeft, centred));
}

/** Size for a corner sticker that must fit in `slotPx` of free width. Returns 0 (hide it) when it would have to be cropped or squeezed below `min`. */
export function fitSticker(slotPx: number, max = 74, min = 44): number {
  if (!(slotPx >= min)) return 0;
  return Math.floor(Math.min(max, slotPx));
}
