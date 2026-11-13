import test from "node:test";
import assert from "node:assert/strict";
import { beginRequest, endRequest, noteRetry, getActivity, subscribe } from "./netActivity.js";

test("quick requests show nothing; slow ones upgrade their own message; it always ends idle", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let calls = 0; const off = subscribe(() => { calls += 1; });

  const fast = beginRequest({ write: true });
  t.mock.timers.tick(300);
  assert.equal(getActivity().phase, "idle", "under 0.7 s: no flash");
  endRequest(fast);
  assert.equal(getActivity().phase, "idle");

  const id = beginRequest({ write: true });
  t.mock.timers.tick(800);
  assert.equal(getActivity().phase, "working");
  assert.match(getActivity().message, /Saving/);
  t.mock.timers.tick(4500);
  assert.equal(getActivity().phase, "slow");
  assert.match(getActivity().message, /safe/);
  noteRetry(id);
  assert.equal(getActivity().phase, "waking");
  endRequest(id);
  assert.equal(getActivity().phase, "idle");
  assert.equal(getActivity().pending, 0);

  const r = beginRequest({ write: false });
  t.mock.timers.tick(900);
  assert.match(getActivity().message, /Loading/);
  endRequest(r); endRequest(r); // ending twice is harmless
  assert.equal(getActivity().phase, "idle");
  assert.ok(calls >= 4);
  off();
});
