import test from "node:test";
import assert from "node:assert/strict";
import { isChunkError, claimReload } from "./chunkRecovery.js";

test("recognises stale-chunk errors from each browser", () => {
  assert.ok(isChunkError(new TypeError("Failed to fetch dynamically imported module: https://x.app/assets/AssistantPanel-B6TVcRbb.js")));
  assert.ok(isChunkError(new Error("error loading dynamically imported module: https://x.app/assets/a.js")));
  assert.ok(isChunkError({ message: "Importing a module script failed." }));
  assert.ok(isChunkError("Unable to preload CSS for /assets/a.css"));
});
test("ignores ordinary errors", () => {
  assert.ok(!isChunkError(new Error("Cannot read properties of undefined")));
  assert.ok(!isChunkError(null));
  assert.ok(!isChunkError(undefined));
});
test("reloads at most once a minute (no reload loop)", () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(claimReload(st, 1_000_000), true);
  assert.equal(claimReload(st, 1_030_000), false);
  assert.equal(claimReload(st, 1_061_000), true);
});
