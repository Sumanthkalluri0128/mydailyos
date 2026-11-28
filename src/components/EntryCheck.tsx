// Feedback while you log food: what is left, a heavy-day plan, protein fixes, steps and training. Reads today's logs from the server
// (same answer as the web app), so it updates after every entry. Never says "fast", "skip" or "burn it off".
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { read } from '../utils/offline';
import { today } from '../config/api';
import { useThemedStyles } from './UI';

type Check = {
  status: string; eaten: number; budget: number; messages: string[];
  proteinFixes: { key: string; food: string; grams: number; protein: number; kcal: number }[];
  nextDays: { date: string; steps: number; note: string }[];
};
const ICON: Record<string, string> = { CHEAT_DAY: '🍰', HEAVY: '🍽️', OVER: '💡', ON_PLAN: '✅', LOW: '🥣', UNDER: '🥣' };
const NAME: Record<string, string> = { CHEAT_DAY: 'Cheat day', HEAVY: 'Heavy day', OVER: 'A little over', ON_PLAN: 'On plan', LOW: 'Under plan', UNDER: 'Well under plan' };
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString();

export function EntryCheck({ refreshKey }: { refreshKey: string | number }) {
  const { colors } = useThemedStyles();
  const [c, setC] = useState<Check | null>(null);
  useEffect(() => {
    let on = true;
    const t = setTimeout(() => {                                   // a burst of edits asks once
      read<any>(`/api/coach/entry-check?today=${today()}&hour=${new Date().getHours()}`).then((j) => on && setC(j?.check || null)).catch(() => {});
    }, 400);
    return () => { on = false; clearTimeout(t); };
  }, [refreshKey]);
  if (!c || c.status === 'NO_FOOD_LOGGED' || !c.messages.length) return null;
  const hot = c.status === 'CHEAT_DAY' || c.status === 'HEAVY';
  return (
    <View accessibilityRole="alert" style={{ marginBottom: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: hot ? '#e5484d88' : colors.border, backgroundColor: hot ? '#e5484d14' : colors.card }}>
      <Text style={{ fontWeight: '800', color: colors.ink }}>{ICON[c.status] || '💡'} {NAME[c.status] || 'Today'} · {fmt(c.eaten)} / {fmt(c.budget)} kcal</Text>
      {c.messages.map((m, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 4 }}>{m}</Text>)}
      {c.proteinFixes.map((f) => <Text key={f.key} style={{ color: colors.primary, fontWeight: '700', fontSize: 12.5, marginTop: 4 }}>+{f.grams} g {f.food}: {f.protein} g protein, {f.kcal} kcal</Text>)}
      {hot && c.nextDays.map((d, i) => <Text key={d.date} style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>Day {i + 1}: steps {fmt(d.steps)} · {d.note}</Text>)}
    </View>
  );
}
