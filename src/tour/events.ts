// A tiny bus: the API layer and the offline queue announce every successful write; the tour turns those into "first win" events.
type Fn = (method: string, path: string) => void;
const subs = new Set<Fn>();
export const onApiWrite = (f: Fn) => { subs.add(f); return () => { subs.delete(f); }; };
export const announceWrite = (method: string, path: string) => { if (String(method).toUpperCase() !== 'GET') subs.forEach((f) => { try { f(method, path); } catch { /* the tour never breaks a save */ } }); };
