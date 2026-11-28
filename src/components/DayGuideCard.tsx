// Today's coach: which maintenance applies (picked from yesterday, unless you chose a level), what to do after a heavy day or a missed
// workout, and "what am I?" from your own steps, training and weight trend. Same server answer as the web app.
// Nothing here ever tells you to fast or to burn it off.
import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { read } from '../utils/offline';
import { today } from '../config/api';
import { updateProfile, useProfile } from '../hooks/useProfile';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';

type Guide = {
  maintenance: { tdee: number | null; label: string; basis: string; mode: string };
  yesterday: { missedWorkout: boolean } | null;
  recovery: { dayIndex: number; date: string; stepsTarget: number; days: { date: string; steps: number; note: string }[] } | null;
  notes: string[];
  activity: { message?: string; switch?: boolean; suggested?: string | null; suggestedAppLevel?: string | null };
};
const LEVELS: [string, string][] = [['sedentary', 'No activity'], ['light', 'Light'], ['moderate', 'Moderate'], ['very_active', 'Very active']];
const LABEL: Record<string, string> = { no_activity: 'No activity', moderate: 'Moderate', active: 'Active', average: '7-day average' };
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString();

export function DayGuideCard() {
  const { colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const { profile } = useProfile() as { profile: any };
  const [g, setG] = useState<Guide | null>(null);
  const [open, setOpen] = useState(false);           // always starts collapsed
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { read<any>(`/api/coach/day-guide?today=${today()}`).then((j) => setG(j?.guide || null)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load, profile?.activityMode, profile?.activityLevel]);
  if (!g || !g.maintenance?.tdee) return null;

  const patch = async (body: Record<string, any>) => {
    setBusy(true);
    try { await updateProfile(body); success('Saved', 'Your calorie target follows it.'); load(); }
    catch (e: any) { error('Could not save', e.message); } finally { setBusy(false); }
  };
  const m = g.maintenance, a = g.activity || {}, rec = g.recovery;
  const manual = (profile?.activityMode || m.mode) !== 'auto';
  const hot = !!rec || !!g.yesterday?.missedWorkout;
  const chip = (label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity key={label} accessibilityRole="button" accessibilityState={{ selected: on, disabled: busy }} disabled={busy} onPress={onPress}
      style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent', marginRight: 8, marginBottom: 8 }}>
      <Text style={{ fontWeight: '700', fontSize: 13, color: on ? '#fff' : colors.ink }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{ marginBottom: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: hot ? '#e5484d88' : colors.border, backgroundColor: hot ? '#e5484d14' : colors.card }}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 22 }}>{rec ? '🌿' : g.yesterday?.missedWorkout ? '🏋️' : '🧭'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{rec ? `Recovery day ${rec.dayIndex}/3` : `Maintenance today: about ${fmt(m.tdee as number)} kcal`}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>{rec ? `After ${rec.date} · normal meals, no fasting, steps ${fmt(rec.stepsTarget)}` : `${LABEL[m.label] || m.label} · ${m.basis}`}</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 16 }}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ marginTop: 10 }}>
          {g.notes.map((n, i) => <Text key={i} style={{ color: colors.ink, fontSize: 13.5, lineHeight: 19, marginBottom: 4 }}>• {n}</Text>)}
          {rec && rec.days.map((d, i) => (
            <Text key={d.date} style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>{i + 1 === rec.dayIndex ? 'Today' : d.date}: steps {fmt(d.steps)} · {d.note}</Text>
          ))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }} accessibilityLabel="Safe minimum calories">
            <Text style={{ color: colors.muted, fontSize: 12.5, marginRight: 8, marginBottom: 8 }}>Safe minimum</Text>
            {([[null, 'Default'], [1600, '1,600'], [1700, '1,700'], [1800, '1,800']] as [number | null, string][]).map(([v, l]) => chip(l, (profile?.goals?.calorieFloor ?? null) === v, () => patch({ goals: { calorieFloor: v } })))}
          </View>
          {!!a.message && <Text style={{ color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 8 }}><Text style={{ fontWeight: '800' }}>What am I? </Text>{a.message}</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }} accessibilityLabel="Activity level">
            {chip('Automatic', !manual, () => patch({ activityMode: 'auto' }))}
            {chip('I choose', manual, () => patch({ activityMode: 'manual' }))}
            {manual && LEVELS.map(([v, l]) => chip(l, (profile?.activityLevel || 'moderate') === v, () => patch({ activityMode: 'manual', activityLevel: v })))}
            {a.switch && a.suggestedAppLevel ? chip(`Switch to ${LABEL[a.suggested || ''] || a.suggested}`, false, () => patch({ activityMode: 'manual', activityLevel: a.suggestedAppLevel })) : null}
          </View>
        </View>
      )}
    </View>
  );
}
