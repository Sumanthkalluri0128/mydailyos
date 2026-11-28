import { report } from '../utils/telemetryClient';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { API_URL } from '../config/api';
import { useTheme } from '../utils/theme';

const IDLE_MS = 10 * 60 * 1000; // free hosting sleeps after ~15 min idle

/** Pings /api/health on open (and after the app has been in the background a while). If the server is still waking after a
 * couple of seconds, says so — instead of leaving a blank screen — and hides itself the moment it answers. */
export function ServerWakeBanner() {
  const { colors: c } = useTheme();
  const [waking, setWaking] = useState(false);
  const [secs, setSecs] = useState(0);
  const cancelled = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let backgroundAt = 0;

    const wake = async () => {
      if (running.current) return;
      running.current = true;
      const t0 = Date.now();
      const show = setTimeout(() => !cancelled.current && setWaking(true), 2500);
      const tick = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000);
      for (let attempt = 0; attempt < 10 && !cancelled.current; attempt += 1) {
        const ctl = new AbortController();
        const abort = setTimeout(() => ctl.abort(), 70000);
        try {
          const r = await fetch(`${API_URL}/api/health`, { signal: ctl.signal });
          clearTimeout(abort);
          if (r.ok) break;
        } catch { clearTimeout(abort); }
        await new Promise((res) => setTimeout(res, 2500));
      }
      clearTimeout(show); clearInterval(tick);
      if (Date.now() - t0 > 2500) report({ wakeMs: Date.now() - t0 }); // a slow answer = the free server was waking up
      running.current = false;
      if (!cancelled.current) { setWaking(false); setSecs(0); }
    };

    wake();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') backgroundAt = Date.now();
      else if (st === 'active' && backgroundAt && Date.now() - backgroundAt > IDLE_MS) { backgroundAt = 0; wake(); }
    });
    return () => { cancelled.current = true; sub.remove(); };
  }, []);

  if (!waking) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: c.warnSoft, paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="small" color={c.warnInk} />
      <Text style={{ marginLeft: 8, flexShrink: 1, fontSize: 12, fontWeight: '700', color: c.warnInk, textAlign: 'center' }}>
        Waking up the server{secs > 0 ? ` (${secs}s)` : ''}… it sleeps when idle and takes up to a minute. Saved data is shown meanwhile.
      </Text>
    </View>
  );
}
