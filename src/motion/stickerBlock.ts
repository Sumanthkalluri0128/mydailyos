// Stickers the audit (tools/audit_stickers.py) found cut off, tiny or mostly empty. Nothing may use them.
import data from './stickerBlocklist.json';
export const BLOCKED: ReadonlySet<string> = new Set<string>((data as { ids: string[] }).ids);
export const isBlocked = (who: string, name: string): boolean => BLOCKED.has(`${who}/${name}`);
/** Same shape as the input with every blocklisted sticker (and any category left empty) removed. */
export function withoutBlocked<T extends { name: string }>(all: Record<string, Record<string, T[]>>, blocked: ReadonlySet<string> = BLOCKED): Record<string, Record<string, T[]>> {
  const out: Record<string, Record<string, T[]>> = {};
  for (const [who, cats] of Object.entries(all)) {
    out[who] = {};
    for (const [cat, list] of Object.entries(cats)) {
      const keep = list.filter((s) => !blocked.has(`${who}/${s.name}`));
      if (keep.length) out[who][cat] = keep;
    }
  }
  return out;
}
