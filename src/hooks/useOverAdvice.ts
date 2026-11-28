// Loads the last 7 days + profile and runs the over-day engine on the phone, so the advice uses the SAME numbers the person sees
// (and works offline from the saved copy). Returns null until there is enough to analyse.
import { useCallback, useEffect, useState } from 'react';
import { read, useRefreshOnSync } from '../utils/offline';
import { today } from '../config/api';
import { useProfile } from './useProfile';
import { analyseOverDays, type HistDay, type OverResult } from '../utils/overEngine';

const addDays = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

export function useOverAdvice(): OverResult | null {
  const { profile } = useProfile();
  const [days, setDays] = useState<HistDay[] | null>(null);
  const load = useCallback(async () => {
    const to = today();
    try { const r = await read<{ days: HistDay[] }>(`/api/progress/history?from=${addDays(to, -6)}&to=${to}`); setDays(r.days || []); } catch { /* optional: the server advice is the fallback */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRefreshOnSync(() => load());
  if (!days || !profile) return null;
  return analyseOverDays({ profile, history: days, today: today(), hour: new Date().getHours() });
}
