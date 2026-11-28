// Wraps the app. When the optional lock is on, covers everything with a guard-pose character until the phone confirms it is you.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import Buddy from '../motion/Buddy';
import { useTheme } from '../utils/theme';
import { authenticate, loadLock, lockCapable } from '../utils/appLock';
import { LockSettings, DEFAULT_LOCK, lockMessage, lockOutcome, shouldLock } from '../utils/appLockPure';
import { successHaptic } from '../utils/haptics';

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { colors: c } = useTheme();
  const [locked, setLocked] = useState(false);
  const [msg, setMsg] = useState('');
  const settings = useRef<LockSettings>(DEFAULT_LOCK);
  const unlocked = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  const busy = useRef(false);

  const prompt = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const o = lockOutcome(await authenticate());
      if (o === 'unlocked') { unlocked.current = true; backgroundedAt.current = null; setLocked(false); setMsg(''); successHaptic(); }
      else if (o === 'unavailable') { unlocked.current = true; setLocked(false); } // no screen lock on the phone: never trap the person
      else setMsg(lockMessage(o));
    } finally { busy.current = false; }
  }, []);

  const evaluate = useCallback(async () => {
    settings.current = await loadLock();
    const capable = settings.current.enabled ? await lockCapable() : false;
    if (shouldLock({ settings: settings.current, capable, unlocked: unlocked.current, backgroundedAt: backgroundedAt.current, now: Date.now() })) {
      unlocked.current = false; setLocked(true); prompt();
    }
  }, [prompt]);

  useEffect(() => { evaluate(); }, [evaluate]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background' || st === 'inactive') { if (backgroundedAt.current === null) backgroundedAt.current = Date.now(); }
      else if (st === 'active') { evaluate(); }
    });
    return () => sub.remove();
  }, [evaluate]);

  return (
    <>
      {children}
      {locked && (
        <View accessibilityViewIsModal style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Buddy who={'zoro' as any} scene="fight" size={160} talk={false} label="A guard standing watch" />
          <Text style={{ fontSize: 24, fontWeight: '800', color: c.ink, marginTop: 12 }}>FlexFit is locked</Text>
          <Text style={{ color: c.muted, textAlign: 'center', marginTop: 6 }}>I am standing guard. Only you get in.</Text>
          {!!msg && <Text accessibilityLiveRegion="polite" style={{ color: c.ink, textAlign: 'center', marginTop: 12 }}>{msg}</Text>}
          <TouchableOpacity onPress={prompt} accessibilityRole="button" accessibilityLabel="Unlock FlexFit"
            style={{ marginTop: 22, minHeight: 52, minWidth: 200, borderRadius: 16, backgroundColor: c.primarySolid, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Unlock</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}
