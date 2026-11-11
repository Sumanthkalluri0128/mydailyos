import test from "node:test";
import assert from "node:assert/strict";
import { readCookie, requestExtras, signInExtras, isSignedIn, startSession, endSession, getToken } from "./session.js";

// Classic mode is what the tests run in (VITE_COOKIE_AUTH is not set): the old behaviour must not change.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

test("classic mode: token kept in localStorage, sent as a Bearer header by api.js, no cookie settings", () => {
  store.clear();
  assert.equal(isSignedIn(), false); assert.equal(getToken(), null);
  startSession("tok123");
  assert.equal(isSignedIn(), true); assert.equal(getToken(), "tok123");
  assert.deepEqual(requestExtras(), { headers: {} }); assert.deepEqual(signInExtras(), { headers: {} });
  endSession();
  assert.equal(isSignedIn(), false); assert.equal(getToken(), null);
});
test("starting a session without a token in classic mode does not pretend to be signed in", () => {
  store.clear(); startSession(undefined); assert.equal(isSignedIn(), false);
});
test("readCookie finds a cookie by name and survives a missing document", () => {
  globalThis.document = { cookie: "a=1; mdos_csrf=ab%2Fc; b=2" };
  assert.equal(readCookie("mdos_csrf"), "ab/c"); assert.equal(readCookie("nope"), ""); assert.equal(readCookie("mdos"), "");
  delete globalThis.document; assert.equal(readCookie("mdos_csrf"), "");
});
