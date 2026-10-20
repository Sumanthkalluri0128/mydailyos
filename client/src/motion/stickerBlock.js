import BLOCK from "./stickerBlocklist.json" with { type: "json" };

/** Manifest without the stickers the audit (tools/stickers/audit_stickers.py) flagged as cut off, tiny or mostly empty. */
export function withoutBlocked(man, ids = BLOCK.ids) {
  const bad = new Set(ids), out = {};
  for (const [who, cats] of Object.entries(man)) {
    out[who] = {};
    for (const [cat, list] of Object.entries(cats)) { const keep = list.filter((e) => !bad.has(`${who}/${e[0]}`)); if (keep.length) out[who][cat] = keep; }
  }
  return out;
}
