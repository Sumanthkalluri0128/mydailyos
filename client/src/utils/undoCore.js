// Undo instead of "Are you sure?": the item is hidden at once and only really removed after a short window.
// Pure (timers are injected) so it can be tested. gate() resolves true when the window ends (go ahead and delete),
// false if the person pressed Undo. flushAll() ends every open window early (used when the tab is closed or hidden).
export function createUndoQueue({ setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const open = new Map();
  let n = 0;
  function gate(delay = 5000) {
    const id = ++n;
    let finish;
    const promise = new Promise((res) => { finish = res; });
    const timer = setTimer(() => { open.delete(id); finish(true); }, delay);
    open.set(id, { timer, finish });
    return {
      promise,
      undo: () => { const o = open.get(id); if (!o) return false; clearTimer(o.timer); open.delete(id); o.finish(false); return true; },
      pending: () => open.has(id),
    };
  }
  function flushAll() { for (const [id, o] of [...open]) { clearTimer(o.timer); open.delete(id); o.finish(true); } }
  return { gate, flushAll, size: () => open.size };
}
