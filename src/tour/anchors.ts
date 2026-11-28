// Anchors: a screen marks an element with ref={tourRef('add-water')} (plus testID="tour-add-water"); the spotlight measures it with
// measureInWindow. Screens that scroll register their ScrollView with useTourScroll so an anchor below the fold can be brought into view.
import { useRef } from 'react';
import type { Rect } from './tourEngine';

const nodes = new Map<string, any>();
export const tourRef = (name: string) => (node: any) => { if (node) nodes.set(name, node); else nodes.delete(name); };
export const hasAnchor = (name: string) => nodes.has(name);

export function measureAnchor(name: string): Promise<Rect | null> {
  const n = nodes.get(name);
  if (!n || typeof n.measureInWindow !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 400);
    try { n.measureInWindow((x: number, y: number, w: number, h: number) => { if (done) return; done = true; clearTimeout(t); resolve(w > 0 && h > 0 ? { x, y, w, h } : null); }); }
    catch { done = true; clearTimeout(t); resolve(null); }
  });
}

let scroller: { scrollTo: (o: { y: number; animated?: boolean }) => void; getOffset: () => number } | null = null;
/** Spread onto a ScrollView: <ScrollView ref={t.ref} onScroll={t.onScroll} scrollEventThrottle={32}> */
export function useTourScroll() {
  const offset = useRef(0);
  return {
    ref: (node: any) => { scroller = node ? { scrollTo: (o) => node.scrollTo?.(o), getOffset: () => offset.current } : null; },
    onScroll: (e: any) => { offset.current = e?.nativeEvent?.contentOffset?.y || 0; },
  };
}
/** Scroll so the anchor sits about a quarter of the way down. Returns false when nothing can scroll. */
export function scrollAnchorIntoView(rect: Rect, viewH: number): boolean {
  if (!scroller) return false;
  scroller.scrollTo({ y: Math.max(0, scroller.getOffset() + rect.y - viewH * 0.25), animated: true });
  return true;
}
