// Shared motion tokens + hooks. Uses RN's built-in Animated (no new dependencies, works in Expo Go).
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Easing } from 'react-native';

export const EASE = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
};
export const SPRING = {
  snappy: { stiffness: 380, damping: 22, mass: 0.8 },  // taps
  bouncy: { stiffness: 220, damping: 9, mass: 0.9 },   // celebrations
};
export const DUR = { tap: 120, ui: 240, reveal: 520, hero: 1100 };

/** True when the OS "Reduce Motion" setting is on. Components should skip non-essential motion. */
export function useReduceMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setR).catch(() => {});
    const s = AccessibilityInfo.addEventListener('reduceMotionChanged', setR);
    return () => s.remove();
  }, []);
  return r;
}

const seen = new Set<string>();
/** Calls fn once per key per day when `done` flips false -> true (never on first render / initial load). */
export function useCelebrateOnce(key: string, done: boolean, fn: () => void) {
  const prev = useRef(done);
  useEffect(() => {
    const k = `ff_cel_${new Date().toDateString()}_${key}`;
    if (done && prev.current === false && !seen.has(k)) {
      seen.add(k); // persisted too, so relaunching the app never replays today's celebration
      AsyncStorage.getItem(k).then((v) => { if (v !== '1') { AsyncStorage.setItem(k, '1').catch(() => {}); fn(); } }).catch(() => fn());
    }
    prev.current = done;
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
}
