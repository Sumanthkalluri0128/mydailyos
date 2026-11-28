// Body plan, in four tabs so nothing is buried:
//   Workout = what to do today (default)   Eating = calories, macros, vitamins   Me = goal setup + tape measurements   More = the "why" and extras
// The top card always shows the headline numbers and the one button that matters: "Use this plan" (saves it so Home, Food and Planner follow it).
// Server: GET /api/body-plan, POST /api/body-plan/apply (lib/bodyPlan.js). Needs a connection: the plan is computed on the server.
import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Field, Screen, useThemedStyles } from '../../components/UI';
import { Chip } from '../../components/Chip';
import { useNotifications } from '../../components/Notifications';
import { get, post, today } from '../../config/api';
import { newClientId } from '../../utils/offline';
import { clearProfileCache } from '../../hooks/useProfile';
import { TrainingSetup, Analysis, Workout, ActiveDays, Progress, Safety } from '../../components/TrainingSections';

const ICON: Record<string, string> = { lean: '🌿', athletic: '🏃', muscular: '🏋️', balanced: '🧘' };
const TAPE_LABEL: Record<string, string> = { waist: 'Waist', neck: 'Neck', hips: 'Hips', chest: 'Chest', arm: 'Upper arm', thigh: 'Thigh' };

// Defined outside the screen so typing in a field inside a card never remounts it.
function Card({ k, title, open, onToggle, children }: { k: string; title: string; open?: boolean; onToggle: (k: string) => void; children: any }) {
  const { S, colors } = useThemedStyles();
  return (
    <View style={S.card}>
      <TouchableOpacity onPress={() => onToggle(k)} accessibilityRole="button" accessibilityState={{ expanded: !!open }} style={S.between}>
        <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 15, flex: 1 }}>{title}</Text>
        <Text style={{ color: colors.muted }}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open && <View style={{ marginTop: 10 }}>{children}</View>}
    </View>
  );
}
function Line({ t }: { t: string }) {
  const { colors } = useThemedStyles();
  return <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19, marginBottom: 5 }}>• {t}</Text>;
}
function Stat({ l, v }: { l: string; v: string }) {
  const { S, colors } = useThemedStyles();
  return (
    <View style={{ flexBasis: '48%', flexGrow: 1, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginBottom: 8 }}>
      <Text style={S.muted}>{l}</Text><Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>{v}</Text>
    </View>
  );
}

export default function BodyPlanScreen() {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const [d, setD] = useState<any>(null);
  const [pick, setPick] = useState<string>('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<string>('workout');
  const [prefs, setPrefs] = useState<any>(null); // the training setup being edited; previewed on the server, saved with "Use this plan"

  const load = useCallback(async (type?: string, tp?: any) => {
    try {
      const q: string[] = [];
      if (type) q.push(`type=${encodeURIComponent(type)}`);
      if (tp) {
        for (const k of ['place', 'level', 'days', 'minutes']) q.push(`${k}=${encodeURIComponent(tp[k] ?? '')}`);
        for (const k of ['equipment', 'limits', 'focus', 'weekdays']) q.push(`${k}=${encodeURIComponent((tp[k] || []).join(','))}`);
      }
      q.push(`date=${today()}`);
      const j = await get<any>(`/api/body-plan?${q.join('&')}`);
      setD(j); setPick((p) => type || p || j.chosen || '');
      const sp = j.plan?.training?.prefs;
      if (sp && !tp) setPrefs({ place: sp.place, level: sp.level, days: sp.days, minutes: sp.minutes, equipment: sp.equipment, limits: sp.limits, focus: sp.focus, weekdays: sp.weekdays || [] });
    } catch (e: any) { error('Could not load', e.network ? 'The body plan needs a connection.' : e.message); }
  }, [error]);
  const changePrefs = (next: any) => { setPrefs(next); load(pick, next); };
  useEffect(() => { load(); }, [load]);

  if (!d) return <Screen><Text style={S.muted}>Loading…</Text></Screen>;
  const plan = d.plan;
  const ready = plan?.ready;
  const toggle = (k: string) => setOpenCards((o) => ({ ...o, [k]: !o[k] }));

  const choose = (id: string) => { setPick(id); load(id, prefs); };
  const saveTape = async () => {
    const entries = Object.entries(vals).filter(([, v]) => Number(v) > 0);
    if (!entries.length) return;
    setBusy(true);
    try {
      for (const [type, v] of entries) await post('/api/health-logs', { type, date: today(), value: Number(v), clientId: newClientId('m') });
      setVals({}); success('Saved', 'Your plan is updated with these measurements.'); await load(pick, prefs);
    } catch (e: any) { error('Could not save', e.message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      await post('/api/body-plan/apply', { type: pick, training: prefs, date: today(), recalc: true });
      clearProfileCache();
      success('Plan saved', 'Your calories, macros, quests and training now follow this body goal.');
      load(pick, prefs); // stay on the tab and refresh
    } catch (e: any) { error('Could not save the plan', e.message); } finally { setBusy(false); }
  };

  // Log a finished (or skipped) session. The server returns the re-worked plan, so the week, targets and advice update at once.
  const logSession = async (payload: any): Promise<boolean> => {
    setBusy(true);
    try {
      const j = await post<any>('/api/body-plan/session', { ...payload, clientId: newClientId('bp') });
      setD((old: any) => ({ ...old, plan: j.plan }));
      if (payload.status === 'skipped') success('Noted', 'Your week has been adjusted.');
      else success('Session logged', j.highlights && j.highlights.length ? `${j.highlights[0].name}: ${j.highlights[0].text}` : 'Your plan is updated.');
      clearProfileCache();
      return true;
    } catch (e: any) { error('Could not save', e.network ? 'The body plan needs a connection.' : e.message); return false; } finally { setBusy(false); }
  };
  // One-tap suggestions (more days, remove moves that hurt, level up) change the saved setup, then the plan is worked out again.
  const applySuggestion = async (change: any) => {
    const next = { ...(prefs || {}), ...(change.prefs || {}) };
    setPrefs(next);
    setBusy(true);
    try { await post('/api/body-plan/apply', { type: pick, training: next, date: today() }); clearProfileCache(); success('Plan updated', 'Your training now follows this change.'); await load(pick, next); }
    catch (e: any) { error('Could not update', e.message); } finally { setBusy(false); }
  };
  const isCurrent = d.chosen === pick;
  const TABS: [string, string, string][] = [['workout', '💪', 'Workout'], ['eating', '🍽️', 'Eating'], ['me', '📏', 'Me'], ['more', '📘', 'More']];
  const macroStats = plan && ready && (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <Stat l={`Protein (${plan.protein.gPerKg} g per kg)`} v={`${plan.macros.protein} g`} />
      <Stat l="Carbs" v={`${plan.macros.carbs} g`} />
      <Stat l={`Fat (${Math.round(plan.fatShare * 100)}% of calories)`} v={`${plan.macros.fat} g`} />
      <Stat l="Fibre" v={`${plan.fiberG} g`} />
    </View>
  );

  return (
    <Screen>
      <Text style={S.title}>Body plan</Text>

      {/* Step 1: the goal. Four big buttons, one line of explanation for the chosen one. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {d.types.map((t: any) => (
          <TouchableOpacity key={t.id} onPress={() => choose(t.id)} accessibilityRole="button" accessibilityState={{ selected: pick === t.id }}
            style={{ flex: 1, marginHorizontal: 3, paddingVertical: 12, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: pick === t.id ? colors.primary : colors.cardBorder, backgroundColor: pick === t.id ? colors.primarySoft : colors.card }}>
            <Text style={{ fontSize: 26 }}>{ICON[t.id] || '🎯'}</Text>
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 12.5, marginTop: 2 }}>{t.label}{d.chosen === t.id ? ' ✓' : ''}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!pick && <Text style={[S.muted, { marginTop: 8 }]}>{d.types.find((t: any) => t.id === pick)?.blurb}</Text>}
      {!pick && <Text style={[S.muted, { marginTop: 6 }]}>Pick the body you are aiming for to see your plan.</Text>}

      {pick && plan && !ready && (
        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{plan.reason === 'adult-only' ? 'Adults only' : 'A little more about you first'}</Text>
          <Text style={[S.muted, { marginTop: 4 }]}>{plan.message}</Text>
          {plan.reason === 'missing-profile' && <View style={{ marginTop: 10 }}><Button title="Open my profile" onPress={() => router.push('/(tabs)/profile' as any)} /></View>}
        </View>
      )}

      {pick && ready && (
        <>
          {plan.safety.filter((s: any) => s.level !== 'info').map((s: any) => (
            <View key={s.id} style={[S.card, { borderColor: s.level === 'alert' ? colors.danger : colors.cardBorder, borderWidth: 1.5 }]}>
              <Text style={{ fontWeight: '800', color: s.level === 'alert' ? colors.danger : colors.ink }}>{s.title}</Text>
              <Text style={[S.muted, { marginTop: 4 }]}>{s.detail}</Text>
            </View>
          ))}

          {/* Step 2: the headline numbers and the one button that saves everything. */}
          <View style={[S.card, { borderColor: colors.primary, borderWidth: 1.5 }]}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <Stat l="Calories a day" v={plan.calories ? plan.calories.toLocaleString() : '—'} />
              <Stat l={plan.mode === 'lose' ? 'Target weight' : 'Weight'} v={plan.mode === 'lose' ? `${plan.goal.targetWeightKg} kg` : 'Hold steady'} />
              <Stat l={plan.mode === 'lose' ? 'Time needed' : 'Waist goal'} v={plan.mode === 'lose' ? `~${plan.goal.weeks} weeks` : `${plan.goal.waistCm} cm`} />
              <Stat l="Steps a day" v={plan.steps.toLocaleString()} />
            </View>
            <Button title={busy ? 'Saving…' : isCurrent ? 'Save my changes' : 'Use this plan'} onPress={apply} disabled={busy} />
          </View>

          {/* Step 3: four tabs. */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 }}>
            {TABS.map(([id, icon, label]) => (
              <TouchableOpacity key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tab === id }}
                style={{ flex: 1, marginHorizontal: 3, minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: tab === id ? colors.primary : colors.cardBorder, backgroundColor: tab === id ? colors.primary : 'transparent' }}>
                <Text style={{ fontSize: 19 }}>{icon}</Text>
                <Text style={{ fontWeight: '800', fontSize: 12.5, color: tab === id ? '#fff' : colors.ink }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'workout' && <Workout program={plan.training.program} adapt={plan.adapt} onLog={logSession} onApplySuggestion={applySuggestion} busy={busy} />}

          {tab === 'eating' && (
            <>
              <View style={S.card}>
                <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 17, marginBottom: 8 }}>Eat this every day</Text>
                {macroStats}
                <Text style={S.muted}>These are your base numbers. On Home they are resized to each day: earned activity adds carbs and fat, and protein stays the same.</Text>
                <Text style={S.muted}>Drink about {(plan.waterMl / 1000).toFixed(1)} L of water. Spread protein over 3 or 4 meals so it protects your muscle.</Text>
              </View>
              <View style={S.card}>
                <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 17 }}>Vitamins and minerals to watch</Text>
                <Text style={[S.muted, { marginBottom: 6 }]}>Your needs do not drop when you eat less, so these most often run short.</Text>
                {plan.microPriority.map((m: any) => (
                  <View key={m.id} style={{ marginBottom: 8 }}>
                    <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 13 }}>{m.label}</Text>
                    <Text style={S.muted}>{m.why}. Try: {m.foods}.</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {tab === 'me' && (
            <>
              <View style={S.card}>
                <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 17, marginBottom: 8 }}>How do you train?</Text>
                <TrainingSetup options={d.trainingOptions} prefs={prefs} serverPrefs={plan.training.prefs} onChange={changePrefs} />
                <Text style={S.muted}>Your workout updates as you tap. Press “Use this plan” above to keep it.</Text>
              </View>
              <View style={S.card}>
                <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 17, marginBottom: 6 }}>Measurements</Text>
                {plan.shape.map((t: string, i: number) => <Line key={i} t={t} />)}
                {plan.tape.length > 0 && (
                  <>
                    <Text style={[S.label, { marginTop: 8 }]}>Add tape measurements (cm). More readings make the plan more exact.</Text>
                    {plan.tape.map((m: any) => (
                      <View key={m.type}>
                        <Field label={`${TAPE_LABEL[m.type] || m.type} (cm)`} value={vals[m.type] || ''} onChangeText={(v) => setVals((x) => ({ ...x, [m.type]: v }))} keyboardType="decimal-pad" placeholder={m.how} />
                      </View>
                    ))}
                    <Button title={busy ? 'Saving…' : 'Save measurements'} onPress={saveTape} disabled={busy || !Object.values(vals).some((v) => Number(v) > 0)} />
                  </>
                )}
              </View>
            </>
          )}

          {tab === 'more' && (
            <>
              <Card k="analysis" open={openCards.analysis} onToggle={toggle} title="Your body analysis"><Analysis a={plan.analysis} /></Card>
              <Card k="prog" open={openCards.prog} onToggle={toggle} title="Getting stronger every week"><Progress program={plan.training.program} /></Card>
              <Card k="active" open={openCards.active} onToggle={toggle} title="Cardio and active days"><ActiveDays program={plan.training.program} /></Card>
              <Card k="safe" open={openCards.safe} onToggle={toggle} title="Training safety"><Safety items={plan.training.program.safety} /></Card>
              <Card k="about" open={openCards.about} onToggle={toggle} title="About this plan">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  <Stat l="Body fat now" v={`${plan.body.bodyFatPct}% (${plan.body.bodyFatSource === 'tape' ? 'from tape' : 'estimate'})`} />
                  <Stat l="Healthy range" v={`${plan.goal.bodyFatBand[0]} to ${plan.goal.bodyFatBand[1]}%`} />
                  {plan.mode === 'lose' && <Stat l="Pace" v={`${plan.goal.weeklyPaceKg} kg / week`} />}
                </View>
                {plan.notes.map((n: string, i: number) => <Text key={i} style={[S.muted, { marginTop: 4 }]}>{n}</Text>)}
              </Card>
              {plan.checkpoints.length > 0 && (
                <Card k="check" open={openCards.check} onToggle={toggle} title="Checkpoints">
                  {plan.checkpoints.map((c: any) => <Line key={c.week} t={`Week ${c.week}: about ${c.weightKg} kg. ${c.check}`} />)}
                </Card>
              )}
              <Text style={[S.muted, { marginTop: 8, textAlign: 'center' }]}>Targets are estimates to start from, not medical advice. If you have a health condition, are pregnant or breastfeeding, check with your doctor.</Text>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

// A crash in this tab shows a friendly retry screen (and is reported to Sentry) instead of closing the app.
export { ScreenError as ErrorBoundary } from '../../components/ScreenError';
