import { createOfflineQueue, QueuedOp, SendResult } from '../offlineQueue';

function makeStore() {
  let ops: QueuedOp[] = [];
  return {
    load: async () => ops.slice(),
    save: async (next: QueuedOp[]) => { ops = next.slice(); },
    get raw() { return ops; },
  };
}

const op = (over: Partial<QueuedOp> = {}) => ({ method: 'POST' as const, path: '/api/water', body: { amountMl: 250 }, label: 'Water', ...over });

describe('offline queue', () => {
  it('replays writes in the order they were enqueued', async () => {
    const store = makeStore();
    const sentOrder: string[] = [];
    const q = createOfflineQueue({
      load: store.load, save: store.save,
      send: async (o) => { sentOrder.push(o.label); return { ok: true }; },
    });
    await q.enqueue(op({ label: 'first' }));
    await q.enqueue(op({ label: 'second' }));
    await q.enqueue(op({ label: 'third' }));
    const summary = await q.flush();
    expect(sentOrder).toEqual(['first', 'second', 'third']);
    expect(summary).toEqual({ sent: 3, dropped: 0, remaining: 0, paused: null });
  });

  it('a network failure pauses the queue without dropping anything', async () => {
    const store = makeStore();
    let calls = 0;
    const q = createOfflineQueue({
      load: store.load, save: store.save,
      send: async (): Promise<SendResult> => { calls++; return { ok: false, network: true }; },
    });
    await q.enqueue(op({ label: 'a' }));
    await q.enqueue(op({ label: 'b' }));
    const summary = await q.flush();
    expect(summary).toEqual({ sent: 0, dropped: 0, remaining: 2, paused: 'network' });
    expect(calls).toBe(1); // stops at the first failure, doesn't try "b" out of order
    expect(store.raw).toHaveLength(2);
  });

  it('a 401 pauses the queue (keeps items) so the person can log back in', async () => {
    const store = makeStore();
    const dropped: string[] = [];
    const q = createOfflineQueue({
      load: store.load, save: store.save,
      send: async () => ({ ok: false, status: 401 }),
      onDropped: (o) => dropped.push(o.label),
    });
    await q.enqueue(op({ label: 'needs-auth' }));
    const summary = await q.flush();
    expect(summary.paused).toBe('auth');
    expect(summary.remaining).toBe(1);
    expect(dropped).toEqual([]);
  });

  it('a validation-style 4xx is dropped immediately and reported', async () => {
    const store = makeStore();
    const dropped: { label: string; reason: string }[] = [];
    const q = createOfflineQueue({
      load: store.load, save: store.save,
      send: async () => ({ ok: false, status: 400, message: 'Invalid amount' }),
      onDropped: (o, reason) => dropped.push({ label: o.label, reason }),
    });
    await q.enqueue(op({ label: 'bad-write' }));
    const summary = await q.flush();
    expect(summary).toEqual({ sent: 0, dropped: 1, remaining: 0, paused: null });
    expect(dropped).toEqual([{ label: 'bad-write', reason: 'Invalid amount' }]);
  });

  it('5xx retries up to maxAttempts, then drops — and does not block items behind it forever', async () => {
    const store = makeStore();
    let attemptsSeen = 0;
    const dropped: string[] = [];
    const q = createOfflineQueue({
      load: store.load, save: store.save,
      send: async (o) => { attemptsSeen++; return { ok: false, status: 500 }; },
      onDropped: (o) => dropped.push(o.label),
      maxAttempts: 3,
    });
    await q.enqueue(op({ label: 'flaky' }));

    // Each flush() call is one attempt; the item stays queued (paused) until maxAttempts is hit.
    let s = await q.flush();
    expect(s).toEqual({ sent: 0, dropped: 0, remaining: 1, paused: 'network' });
    s = await q.flush();
    expect(s.remaining).toBe(1);
    s = await q.flush();
    expect(s).toEqual({ sent: 0, dropped: 1, remaining: 0, paused: null }); // 3rd attempt hits the cap
    expect(dropped).toEqual(['flaky']);
    expect(attemptsSeen).toBe(3);
  });

  it('overlapping flush() calls share a single in-flight run', async () => {
    const store = makeStore();
    let concurrentSends = 0;
    let maxConcurrent = 0;
    const q = createOfflineQueue({
      load: store.load, save: store.save,
      send: async () => {
        concurrentSends++;
        maxConcurrent = Math.max(maxConcurrent, concurrentSends);
        await new Promise((r) => setTimeout(r, 5));
        concurrentSends--;
        return { ok: true };
      },
    });
    await q.enqueue(op({ label: 'x' }));
    const [a, b] = await Promise.all([q.flush(), q.flush()]);
    expect(maxConcurrent).toBe(1); // never two sends running at once
    expect(a).toEqual(b); // both callers got the same summary from the shared run
  });

  it('subscribers are notified after enqueue and after flush', async () => {
    const store = makeStore();
    const q = createOfflineQueue({ load: store.load, save: store.save, send: async () => ({ ok: true }) });
    const seen: number[] = [];
    const unsub = q.subscribe((ops) => seen.push(ops.length));
    await q.enqueue(op());
    await q.flush();
    expect(seen).toEqual([1, 0]);
    unsub();
    await q.enqueue(op());
    expect(seen).toEqual([1, 0]); // no more notifications after unsubscribing
  });

  it('clear() empties the queue and notifies', async () => {
    const store = makeStore();
    const q = createOfflineQueue({ load: store.load, save: store.save, send: async () => ({ ok: true }) });
    await q.enqueue(op());
    await q.enqueue(op());
    await q.clear();
    expect(await q.pending()).toEqual([]);
  });
});

describe('offline queue — no lost writes', () => {
  it('a write queued WHILE a sync is running is kept (the old lost-update bug)', async () => {
    const store = makeStore();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const sent: string[] = [];
    const q = createOfflineQueue({
      load: store.load, save: store.save,
      send: async (o) => { sent.push(o.label); if (o.label === 'first') await gate; return { ok: true }; },
    });
    await q.enqueue(op({ label: 'first' }));
    const flushing = q.flush();                 // first is now "in flight"
    await new Promise((r) => setTimeout(r, 5));
    await q.enqueue(op({ label: 'added-during-sync' }));
    release();
    const s = await flushing;
    expect(sent).toEqual(['first', 'added-during-sync']); // the new one was not overwritten and is sent too
    expect(s.remaining).toBe(0);
    expect(store.raw).toHaveLength(0);
  });

  it('a record deleted before it ever synced just disappears from the queue', async () => {
    const store = makeStore();
    const sent: string[] = [];
    const q = createOfflineQueue({ load: store.load, save: store.save, send: async (o) => { sent.push(o.label); return { ok: true }; } });
    await q.enqueue(op({ label: 'create task', body: { clientId: 'c1' } }));
    await q.enqueue(op({ label: 'other' }));
    await q.mutate((ops) => ops.filter((o) => o.body?.clientId !== 'c1'));
    await q.flush();
    expect(sent).toEqual(['other']);
  });

  it('onSent reports the response so real ids can be learned', async () => {
    const store = makeStore();
    const seen: any[] = [];
    const q = createOfflineQueue({
      load: store.load, save: store.save,
      send: async () => ({ ok: true, data: { task: { _id: 'real1' } } }),
      onSent: (o, r) => seen.push([o.label, r.data.task._id]),
    });
    await q.enqueue(op({ label: 'create' }));
    await q.flush();
    expect(seen).toEqual([['create', 'real1']]);
  });
});
