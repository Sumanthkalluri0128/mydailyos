// Extra calories today's festival / trip / diet-break window allows (0 when none is on). Same /api/progress/day copy Home reads, so it is
// cached, works offline and refreshes after a sync.
import { useCallback, useEffect, useState } from 'react';
import { read, useRefreshOnSync } from '../utils/offline';
import { today } from '../config/api';

export function useEventRoom(): number {
  const [room, setRoom] = useState(0);
  const load = useCallback(async () => {
    try { const r = await read<{ eventExtra?: number }>(`/api/progress/day?date=${today()}`); setRoom(Math.max(0, Math.round(Number(r?.eventExtra) || 0))); } catch { /* optional */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRefreshOnSync(() => load());
  return room;
}
