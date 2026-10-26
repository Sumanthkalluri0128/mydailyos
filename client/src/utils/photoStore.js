// Progress photos live ONLY in this browser (IndexedDB). They are never uploaded, so they are not part of the server export;
// they are removed on "Delete account" and by the Delete button. No cloud AI is involved.
const DB = "ff-photos", STORE = "photos";
const open = () => new Promise((res, rej) => {
  if (typeof indexedDB === "undefined") return rej(new Error("This browser cannot store photos."));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => { db.close(); res(out?.result); }; t.onerror = () => rej(t.error); }); };
export const listPhotos = async () => ((await tx("readonly", (s) => s.getAll())) || []).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
export const addPhoto = (blob, date) => tx("readwrite", (s) => s.put({ id: `${date}-${Date.now()}`, date, blob }));
export const deletePhoto = (id) => tx("readwrite", (s) => s.delete(id));
export const clearPhotos = () => tx("readwrite", (s) => s.clear()).catch(() => {});
