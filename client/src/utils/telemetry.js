// Tells the server (aggregate numbers only: no account, no content) when something went wrong behind the scenes, so the admin
// health page can show it. Reports are batched into one small request every 30 s at most, and never get in the way: all errors are swallowed.
export function makeReporter({ send, delayMs = 30_000, setTimer = setTimeout }) {
  let pending = { syncFailed: 0, writesDropped: 0, wakeMs: null };
  let timer = null;
  const flush = () => {
    timer = null;
    const p = pending; pending = { syncFailed: 0, writesDropped: 0, wakeMs: null };
    const body = {};
    if (p.syncFailed) body.syncFailed = p.syncFailed;
    if (p.writesDropped) body.writesDropped = p.writesDropped;
    if (p.wakeMs) body.wakeMs = p.wakeMs;
    if (!Object.keys(body).length) return false;
    try { Promise.resolve(send(body)).catch(() => {}); } catch { /* ignore */ }
    return true;
  };
  const report = ({ syncFailed = 0, writesDropped = 0, wakeMs = 0 } = {}) => {
    pending.syncFailed += Math.max(0, Math.floor(syncFailed));
    pending.writesDropped += Math.max(0, Math.floor(writesDropped));
    if (wakeMs > 0) pending.wakeMs = Math.max(pending.wakeMs || 0, Math.round(wakeMs));
    if (!timer) timer = setTimer(flush, delayMs);
  };
  return { report, flush };
}
