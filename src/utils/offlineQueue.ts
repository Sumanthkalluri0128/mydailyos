// Offline write queue — pure logic with injected storage/network so it can be
// unit-tested. utils/offline.ts wires it to AsyncStorage + the real API client.
//
// Guarantees:
//  * writes are replayed in the order they were made
//  * network failures / 5xx keep the item queued (with a retry cap)
//  * 401 pauses the queue (keeps items; user must log in again)
//  * other 4xx are dropped (they can never succeed) and reported via `onDropped`
//  * every create carries a client-generated `clientId`, so a request that
//    actually reached the server but whose response was lost is NOT duplicated
//    when replayed (the server returns the existing record).
//  * NO LOST WRITES: every change to the stored list goes through one lock, and a flush re-reads storage
//    for each step. (The previous version kept a private copy for the whole flush and re-saved it after every
//    send, so anything the person added *while a sync was running* was silently overwritten and lost.)

export type QueuedOp = {
  id: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: any;
  label: string; // human-readable ("Water 250 ml") for UI + drop messages
  createdAt: number;
  attempts: number;
  meta?: Record<string, any>; // extra info for optimistic UI (e.g. {kind:'food', nutritionTotal:{…}})
};

export type SendResult = { ok: boolean; status?: number; network?: boolean; message?: string; data?: any };

export type QueueDeps = {
  load: () => Promise<QueuedOp[]>;
  save: (ops: QueuedOp[]) => Promise<void>;
  send: (op: QueuedOp) => Promise<SendResult>;
  onDropped?: (op: QueuedOp, reason: string) => void;
  /** Called after an op was accepted by the server (used to learn real ids for locally-created records). */
  onSent?: (op: QueuedOp, res: SendResult) => void;
  now?: () => number;
  maxAttempts?: number;
};

export type FlushSummary = { sent: number; dropped: number; remaining: number; paused: 'network' | 'auth' | null };

export function createOfflineQueue(deps: QueueDeps) {
  const maxAttempts = deps.maxAttempts ?? 8;
  const now = deps.now ?? Date.now;
  let flushing: Promise<FlushSummary> | null = null;
  const listeners = new Set<(ops: QueuedOp[]) => void>();

  // One lock for every read-modify-write of the stored list.
  let lock: Promise<unknown> = Promise.resolve();
  function locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = lock.then(fn, fn);
    lock = run.then(() => undefined, () => undefined);
    return run;
  }

  async function notify(ops?: QueuedOp[]) {
    const list = ops ?? (await deps.load());
    listeners.forEach((l) => l(list));
  }

  async function enqueue(op: Omit<QueuedOp, 'id' | 'createdAt' | 'attempts'> & { id?: string }): Promise<QueuedOp> {
    const full = await locked(async () => {
      const ops = await deps.load();
      const item: QueuedOp = { ...op, id: op.id ?? `${now()}-${Math.round(Math.random() * 1e9)}`, createdAt: now(), attempts: 0 };
      ops.push(item);
      await deps.save(ops);
      return { item, ops };
    });
    await notify(full.ops);
    return full.item;
  }

  /** Atomically rewrite the queue (e.g. drop a create that was never sent, or edit its body). */
  async function mutate(fn: (ops: QueuedOp[]) => QueuedOp[]): Promise<QueuedOp[]> {
    const next = await locked(async () => {
      const out = fn((await deps.load()).map((o) => ({ ...o })));
      await deps.save(out);
      return out;
    });
    await notify(next);
    return next;
  }

  async function runFlush(): Promise<FlushSummary> {
    let sent = 0;
    let dropped = 0;
    let paused: FlushSummary['paused'] = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const head = await locked(async () => (await deps.load())[0]);
      if (!head) break;

      const res = await deps.send(head); // network happens OUTSIDE the lock so new writes can be queued meanwhile

      // Apply the outcome to a *fresh* copy of the stored list.
      const stop = await locked(async () => {
        const ops = await deps.load();
        const i = ops.findIndex((o) => o.id === head.id);
        if (i === -1) return false; // removed by someone else (e.g. the record was deleted before it ever synced)
        if (res.ok) {
          ops.splice(i, 1); sent++;
          await deps.save(ops);
          try { deps.onSent?.(head, res); } catch { /* bookkeeping only */ }
          return false;
        }
        if (res.network) { paused = 'network'; return true; }
        if (res.status === 401) { paused = 'auth'; return true; }
        if ((res.status ?? 0) >= 500 || res.status === 429 || res.status === 408) {
          ops[i] = { ...ops[i], attempts: ops[i].attempts + 1 };
          if (ops[i].attempts >= maxAttempts) {
            const [gone] = ops.splice(i, 1); dropped++;
            await deps.save(ops);
            deps.onDropped?.(gone, res.message || `Server error (${res.status ?? 'unknown'})`);
            return false;
          }
          await deps.save(ops);
          paused = 'network'; // back off; try again on next trigger
          return true;
        }
        const [gone] = ops.splice(i, 1); dropped++;
        await deps.save(ops);
        deps.onDropped?.(gone, res.message || `Rejected (${res.status ?? 'unknown'})`);
        return false;
      });
      if (stop) break;
    }
    const remaining = await deps.load();
    await notify(remaining);
    return { sent, dropped, remaining: remaining.length, paused };
  }

  /** Safe to call from anywhere/anytime; overlapping calls share one run. */
  function flush(): Promise<FlushSummary> {
    if (!flushing) {
      flushing = runFlush().finally(() => { flushing = null; });
    }
    return flushing;
  }

  return {
    enqueue,
    mutate,
    flush,
    isFlushing: () => !!flushing,
    pending: () => deps.load(),
    subscribe(cb: (ops: QueuedOp[]) => void) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    clear: async () => { await locked(async () => { await deps.save([]); }); await notify([]); },
  };
}
