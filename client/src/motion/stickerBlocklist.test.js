import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withoutBlocked } from "./stickerBlock.js";
import RAW from "./stickerManifest.js";

const ids = JSON.parse(fs.readFileSync(new URL("./stickerBlocklist.json", import.meta.url), "utf8")).ids;

test("the audit blocklisted the cut-off stickers", () => {
  for (const id of ["goku/lift-0", "jinwoo/peace-0", "tanjiro/chill-1"]) assert.ok(ids.includes(id), id);
});
test("withoutBlocked drops a sticker and any category left empty", () => {
  const out = withoutBlocked({ a: { x: [["x-0"]], y: [["y-0"], ["y-1"]] } }, ["a/x-0", "a/y-1"]);
  assert.deepEqual(out, { a: { y: [["y-0"]] } });
});
test("the filtered manifest (what every lookup in chars.js reads) never contains a blocklisted sticker", () => {
  const bad = new Set(ids), ok = withoutBlocked(RAW);
  for (const [who, cats] of Object.entries(ok)) for (const list of Object.values(cats)) for (const e of list) assert.ok(!bad.has(`${who}/${e[0]}`));
  const injected = withoutBlocked({ goku: { lift: [["lift-0"], ["lift-1"]] } });
  assert.deepEqual(injected, { goku: { lift: [["lift-1"]] } });
});
test("the generated manifest and server catalogue no longer list them", async () => {
  const man = (await import("./stickerManifest.js")).default;
  const cat = JSON.parse(fs.readFileSync(new URL("../../../server/data/stickerCatalog.json", import.meta.url), "utf8"));
  for (const id of ids) {
    const [w, n] = id.split("/");
    assert.ok(!Object.values(man[w] || {}).flat().some((e) => e[0] === n), `manifest ${id}`);
    assert.ok(!Object.values(cat[w] || {}).flat().includes(n), `catalog ${id}`);
  }
});
