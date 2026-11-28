// Saving a corrected quick-add estimate on the phone (the glue behind the form in food.tsx). The screen passes in what it can do (write, show, offer Undo, reload),
// so what is sent, what the offline cache is told and what Undo sends back can be tested without a screen.
import { quickChange, quickSummary, quickUndoBody } from './quickEdit';

export type QuickCorrectDeps = {
  write: (method: 'PATCH', path: string, body: any, label: string, meta?: Record<string, any>) => Promise<any>;
  showSaved: (patch: { foodName?: string; per: Record<string, number> }) => void;   // the list shows the corrected entry at once
  offerUndo: (message: string, undo: () => Promise<void>) => void;                    // the 5-second Undo; nothing waits, the change is already saved
  reload: () => Promise<void>;
};

/** `x` = the entry as listed, `body` = only what changed (quickEditRequest). Throws when the write is refused, so the screen can say so; nothing is shown or offered then. */
export async function correctQuick(x: any, body: any, d: QuickCorrectDeps) {
  const { per, delta } = quickChange(x, body);
  const path = `/api/food-logs/${x._id}`;
  const label = `Correct ${x.foodName}`;
  await d.write('PATCH', path, body, label, { date: x.date, delta });          // `meta` lets the offline cache move Home and History by exactly this much
  d.showSaved({ ...(body.foodName !== undefined ? { foodName: body.foodName } : {}), per });
  const back = quickUndoBody(x, body);
  const backDelta: Record<string, number> = {};
  for (const k of Object.keys(delta)) backDelta[k] = -delta[k];
  d.offerUndo(quickSummary(x, body), async () => {
    try { await d.write('PATCH', path, back, label, { date: x.date, delta: backDelta }); } catch { /* the list is reloaded below and shows what the server has */ }
    await d.reload();
  });
}
