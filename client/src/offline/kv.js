// Tiny key-value store on IndexedDB (survives reloads, bigger than localStorage). Falls back to localStorage when
// IndexedDB is unavailable (private mode, old browsers). Every call is safe: failures resolve to null instead of throwing.
const DB = "flexfit-offline";
const STORE = "kv";
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r && "result" in r ? r.result : null);
      t.onerror = t.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function kvGet(key) {
  const db = await open();
  if (!db) {
    try { return JSON.parse(localStorage.getItem(`ffkv:${key}`) || "null"); } catch { return null; }
  }
  return tx(db, "readonly", (s) => s.get(key));
}

export async function kvSet(key, value) {
  const db = await open();
  if (!db) {
    try { localStorage.setItem(`ffkv:${key}`, JSON.stringify(value)); } catch { /* full */ }
    return;
  }
  await tx(db, "readwrite", (s) => s.put(value, key));
}

export async function kvDel(key) {
  const db = await open();
  if (!db) { try { localStorage.removeItem(`ffkv:${key}`); } catch { /* ignore */ } return; }
  await tx(db, "readwrite", (s) => s.delete(key));
}

export async function kvKeys(prefix = "") {
  const db = await open();
  if (!db) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(`ffkv:${prefix}`)) out.push(k.slice(5)); }
    return out;
  }
  const all = (await tx(db, "readonly", (s) => s.getAllKeys())) || [];
  return all.filter((k) => String(k).startsWith(prefix));
}
