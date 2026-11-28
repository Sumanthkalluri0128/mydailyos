// The exercise list for the workout planner: the same library the Gym log uses (search, muscle chips, your own exercise),
// so planning a workout feels like logging one. Rows hold sets / reps / kg; the parent keeps the plain-text form
// ("Squat 3x8 @60") the plan already stores, so nothing on the server changes.
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Chip } from '../Chip';
import { useThemedStyles } from '../UI';
import { exerciseList } from '../../data/workoutPlan';
import { GYM_CATS, mergeCatalog } from '../../utils/gymCatalog';
import { exercisesToText, parseExercises } from '../../utils/workoutPlanView';
import { buildIndex, searchExercises } from '../../utils/exerciseSearch';

type Row = { name: string; sets: string; reps: string; kg: string };
type Ex = { id: string; name: string; cat: string; gear: string; unit: 'reps' | 'sec' | 'min' };
const SHOW = 8; // a short list; "Show all" opens the rest
const num = (v: string, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));

export function PlanExercisePicker({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const { S, colors } = useThemedStyles();
  const [rows, setRows] = useState<Row[]>(() => parseExercises(value).map((e: any) => ({ name: e.name, sets: e.sets ? String(e.sets) : '', reps: e.reps ? String(e.reps) : '', kg: e.kg ? String(e.kg) : '' })));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [more, setMore] = useState(false);

  const all = useMemo<Ex[]>(() => mergeCatalog(exerciseList() as any[]).map((e: any) => ({ id: e.id, name: e.name, cat: String(e.cat), gear: e.gear || '', unit: (e.unit || (String(e.cat).toLowerCase() === 'cardio' ? 'min' : 'reps')) as Ex['unit'] })), []);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const index = useMemo(() => buildIndex(all), [all]);
  const byGroup = (a: Ex, b: Ex) => (GYM_CATS as readonly string[]).indexOf(a.cat) - (GYM_CATS as readonly string[]).indexOf(b.cat) || a.name.localeCompare(b.name);
  const found = useMemo(() => {
    if (!words.length && !cat) return { hits: [] as Ex[], similar: [] as Ex[] };
    const inCat = (e: Ex) => !cat || e.cat.toLowerCase() === cat.toLowerCase();
    if (!words.length) return { hits: all.filter(inCat).sort(byGroup), similar: [] as Ex[] };
    const r = searchExercises(all, q, { index });   // forgiving: typos, plurals, "pushup" / "push up", "abs", "db", muscle and gear words
    return { hits: (r.hits as Ex[]).filter(inCat), similar: (r.similar as Ex[]).filter(inCat) };
  }, [all, index, cat, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const hits = found.hits.length ? found.hits : found.similar;
  const shown = more ? hits : hits.slice(0, SHOW);
  const exact = found.hits.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  const push = (next: Row[]) => { setRows(next); onChange(exercisesToText(next.map((r) => ({ name: r.name, sets: num(r.sets, 20), reps: num(r.reps, 200), kg: Number(r.kg) > 0 ? Math.min(1000, Number(r.kg)) : 0 })))); };
  const add = (e: { name: string; unit: string }) => { push([...rows, { name: e.name.slice(0, 60), sets: e.unit === 'min' ? '1' : '3', reps: e.unit === 'min' ? '20' : e.unit === 'sec' ? '30' : '10', kg: '' }]); setQ(''); setCat(''); setMore(false); };
  const edit = (i: number, k: keyof Row, v: string) => push(rows.map((r, j) => (j === i ? { ...r, [k]: v.replace(k === 'kg' ? /[^0-9.]/g : /[^0-9]/g, '') } : r)));
  const remove = (i: number) => push(rows.filter((_, j) => j !== i));

  const input = { borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, padding: 8, fontSize: 15, color: colors.ink, backgroundColor: colors.card, textAlign: 'center' } as const;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={S.muted}>Exercises (optional)</Text>
      {rows.map((r, i) => (
        <View key={`${r.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 8, marginTop: 6 }}>
          <Text numberOfLines={2} style={{ flex: 1, fontWeight: '800', color: colors.ink, fontSize: 13.5 }}>{r.name}</Text>
          {([['sets', 'sets'], ['reps', 'reps'], ['kg', 'kg']] as const).map(([k, label]) => (
            <TextInput key={k} accessibilityLabel={`${r.name} ${label}`} style={[input, { width: 50, padding: 6, fontSize: 14 }]} value={r[k]} placeholder={label} placeholderTextColor={colors.muted} keyboardType={k === 'kg' ? 'decimal-pad' : 'number-pad'} onChangeText={(t) => edit(i, k, t)} />
          ))}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${r.name}`} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => remove(i)}><Text style={{ color: colors.dangerInk, fontWeight: '800' }}>✕</Text></TouchableOpacity>
        </View>
      ))}
      <TextInput style={[input, { textAlign: 'left', marginTop: 8 }]} value={q} placeholder="Add an exercise: squat, pushup, abs…" placeholderTextColor={colors.muted} onChangeText={(t) => { setQ(t); setMore(false); }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ flexDirection: 'row' }}>
        {GYM_CATS.map((c) => <Chip key={c} label={c} active={cat === c} small onPress={() => { setCat(cat === c ? '' : c); setMore(false); }} />)}
      </ScrollView>
      {(words.length > 0 || !!cat) && (
        <View>
          {!found.hits.length && found.similar.length > 0 && <Text style={[S.muted, { marginTop: 6 }]}>No exact match for “{q.trim()}”. Closest matches:</Text>}
          {shown.map((e) => (
            <TouchableOpacity key={e.id} accessibilityRole="button" accessibilityLabel={`Add ${e.name}`} onPress={() => add(e)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 4, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.ink }}>{e.name}</Text>
                <Text style={S.muted}>{e.cat}{e.gear ? ` · ${e.gear}` : ''}{e.unit !== 'reps' ? ` · ${e.unit === 'sec' ? 'timed' : 'minutes'}` : ''}</Text>
              </View>
              <Text style={{ color: colors.primary, fontSize: 20, fontWeight: '800' }}>＋</Text>
            </TouchableOpacity>
          ))}
          {hits.length > SHOW && !more && <TouchableOpacity accessibilityRole="button" onPress={() => setMore(true)} style={{ padding: 8 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Show all {hits.length}</Text></TouchableOpacity>}
          {!hits.length && <Text style={S.muted}>No exercise is close to “{q}”. You can add it as your own below.</Text>}
        </View>
      )}
      {!!q.trim() && !exact && (
        <TouchableOpacity accessibilityRole="button" onPress={() => add({ name: q.trim(), unit: 'reps' })} style={{ padding: 10, borderRadius: 12, backgroundColor: colors.primarySoft, marginTop: 4 }}>
          <Text style={{ color: colors.primary, fontWeight: '800', textAlign: 'center' }}>Use “{q.trim().slice(0, 60)}” as my own exercise</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
