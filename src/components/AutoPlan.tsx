import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { useNotifications } from './Notifications';
import { get, post, today } from '../config/api';
import { SenseiChat } from './SenseiChat';
import { SenseiSticker } from './SenseiSticker';

const MEALS: [string, string][] = [['breakfast', '🌅 Breakfast'], ['lunch', '☀️ Lunch'], ['dinner', '🌙 Dinner'], ['snacks', '🍎 Snacks']];
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayName = (s: string) => parse(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const diff = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
const FLAG: Record<string, string> = { low: '↓', high: '↑' };

/** Smart week planner: balanced plates (protein + carbs + vegetables), your own foods first, lighter days after heavy days. Preview, shuffle, accept. */
export function AutoPlan({ from, to, onClose, onSaved }: { from: string; to: string; onClose: () => void; onSaved: (o?: { shop?: boolean }) => void }) {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const t = today();
  const first = from < t ? t : from;
  const past = to < t;
  const days = Math.max(1, Math.min(7, diff(first, to) + 1));
  const [stage, setStage] = useState<'loading' | 'chat' | 'plan'>('loading');
  const [sensei, setSensei] = useState<any>(null);
  const [mode, setMode] = useState<'balanced' | 'mine'>('balanced');
  const [ctx, setCtx] = useState<any>(null);
  const [variant, setVariant] = useState(0);
  const [plan, setPlan] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { get<any>(`/api/food-prefs?days=${days}`).then((d) => { setSensei(d); setStage(d.setupDone ? 'plan' : 'chat'); }).catch(() => setStage('plan')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { get<any>(`/api/meal-plans/context?from=${first}&days=${days}&today=${t}`).then((c) => setCtx(c)).catch(() => {}); }, [first, days, t]);

  const run = async (preview: boolean, v = variant, thenShop = false) => {
    setBusy(true);
    try {
      const d = await post<any>('/api/meal-plans/auto', { from: first, days, mode, variant: v, preview, today: t });
      if (preview) { setPlan(d); setOpen(d.days?.[0]?.date || null); }
      else { success('Planned', `${d.saved} foods planned for ${days} day${days === 1 ? '' : 's'}.`); onSaved({ shop: thenShop }); onClose(); }
    } catch (e: any) { error('Could not build the plan', e.network ? 'Planning needs a connection.' : e.message); if (preview) setPlan(null); }
    finally { setBusy(false); }
  };
  const a = ctx?.advice;
  if (stage === 'loading') return <View style={S.card}><Text style={S.muted}>Opening the planner…</Text></View>;
  if (stage === 'chat') return <SenseiChat onClose={onClose} onDone={(st) => { setSensei((x: any) => ({ ...x, ...st })); setPlan(null); setStage('plan'); }} />;
  const safety = plan?.safety?.flagged ? plan.safety : sensei?.safety?.flagged ? sensei.safety : null;
  const setChips = (sensei?.chips || []).filter((c: any) => c.set);

  return (
    <View style={S.card}>
      <View style={S.between}>
        <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16, flex: 1 }}>✨ Plan my week</Text>
        <TouchableOpacity accessibilityRole="button" onPress={onClose}><Text style={{ color: colors.primary, fontWeight: '800' }}>Close</Text></TouchableOpacity>
      </View>

      {a && (
        <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: a.level === 'watch' ? colors.primarySoft : '#e5484d14', borderWidth: 1, borderColor: a.level === 'watch' ? colors.border : '#e5484d66' }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{a.level === 'watch' ? '💡' : '⚠️'} {a.headline}</Text>
          <Text style={[S.muted, { marginTop: 2 }]}>{a.skipCut ? a.detail : 'The plan below already uses these lighter days and leaves out treats until you are back on track.'}</Text>
        </View>
      )}

      {safety && (
        <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#e5484d14', borderWidth: 1, borderColor: '#e5484d66' }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>🩺 Please check with a doctor or dietitian</Text><Text style={[S.muted, { marginTop: 2 }]}>{safety.note}</Text>
        </View>
      )}

      <View style={{ marginTop: 10, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}>
        <View style={S.between}><Text style={{ fontWeight: '800', color: colors.ink }}>Your plan setup</Text>{sensei?.sensei?.sticker && <SenseiSticker size={34} label={false} />}</View>
        <Text style={[S.muted, { marginVertical: 6 }]}>{setChips.length ? setChips.map((c: any) => `${c.label}: ${c.value}`).join(' · ') : 'Nothing saved yet.'}</Text>
        <Chip small label={sensei?.setupDone ? 'Improve my plan' : 'Answer a few questions'} onPress={() => setStage('chat')} />
      </View>

      <Text style={[S.label, { marginTop: 10 }]}>Other ways to plan</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip small label="⚖️ Balanced (recommended)" active={mode === 'balanced'} onPress={() => { setMode('balanced'); setPlan(null); }} />
        <Chip small label="🍽️ Only foods I eat" active={mode === 'mine'} onPress={() => { setMode('mine'); setPlan(null); }} />
      </View>
      <Text style={[S.muted, { marginVertical: 6 }]}>{past ? 'This week is over. Pick this week or a future week.' : `Planning ${days} day${days === 1 ? '' : 's'} from ${dayName(first)}. Meals already planned or eaten are left alone.`}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip label={busy ? 'Building…' : plan ? '↻ Shuffle' : 'Preview my plan'} onPress={() => { if (busy || past) return; const v = plan ? variant + 1 : variant; setVariant(v); run(true, v); }} />
        {plan && <Chip label="✓ Use this plan" active onPress={() => { if (!busy) run(false); }} />}
        {plan && <Chip label="✓ Use it and make my grocery list" onPress={() => { if (!busy) run(false, variant, true); }} />}
      </View>
      {plan?.fixed?.filter((f: any) => f.loggedMeals.length).map((f: any) => (
        <Text key={`fx${f.date}`} style={[S.muted, { marginTop: 6 }]}>🔒 {dayName(f.date)}: {f.loggedMeals.join(', ')} already logged ({f.eaten} kcal) stays as is. Planning fills the {Math.max(0, f.remaining)} kcal that are left.</Text>
      ))}
      {plan?.addOns?.map((a: any) => (
        <Text key={`ao${a.date}${a.mealType}`} style={[S.muted, { marginTop: 4 }]}>💡 {dayName(a.date)} {a.mealType}: {a.text}.</Text>
      ))}
      {plan?.notes?.filter((n: string) => n !== plan?.safety?.note).map((n: string) => <Text key={n} style={[S.muted, { marginTop: 6 }]}>ℹ️ {n}</Text>)}

      {plan?.days?.map((d: any) => (
        <View key={d.date} style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
          <TouchableOpacity accessibilityRole="button" onPress={() => setOpen(open === d.date ? null : d.date)}>
            <View style={S.between}>
              <Text style={{ color: colors.ink, fontWeight: '800' }}>{dayName(d.date)}{d.trim > 0 ? ` · lighter (−${d.trim})` : ''}{d.out?.length ? ` · ${d.out.map((o: any) => o.meal).join(' + ')} out` : ''}{d.vrat ? ' · vrat' : ''}{d.ramadan ? ' · Ramadan' : ''}{d.festivalRoom ? ` · feast room ${d.festivalRoom}` : ''}</Text>
              <Text style={{ color: d.status.length ? colors.warnInk : colors.primary, fontWeight: '700', fontSize: 12 }}>{d.status.length ? d.status[0] : '✓ balanced'}</Text>
            </View>
            <Text style={S.muted}>{d.totals.calories} of {d.target} kcal · P {d.totals.protein} g{d.balance ? FLAG[d.balance.protein] || '' : ''} · C {d.totals.carbohydrates} g{d.balance ? FLAG[d.balance.carbs] || '' : ''} · F {d.totals.fat} g{d.balance ? FLAG[d.balance.fat] || '' : ''} · fibre {d.totals.fiber} g{d.balance ? FLAG[d.balance.fiber] || '' : ''}</Text>
          </TouchableOpacity>
          {open === d.date && d.out?.map((o: any) => <Text key={o.meal} style={[S.muted, { marginTop: 6 }]}>🍱 {o.meal} is eaten out{o.kind ? ` (${o.kind})` : ''}: aim for about {o.aim} kcal with protein, a carb and vegetables.</Text>)}
          {open === d.date && MEALS.map(([id, label]) => {
            const its = plan.items.filter((i: any) => i.date === d.date && i.mealType === id);
            return its.length ? (
              <View key={id} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12 }}>{label}</Text>
                {its.map((i: any) => (
                  <View key={`${i.foodId || i.foodName}|${id}`} style={[S.between, { paddingVertical: 4 }]}>
                    <View style={{ flex: 1, paddingRight: 8 }}><Text style={{ color: colors.ink, fontWeight: '600' }}>{i.foodName}</Text><Text style={S.muted}>{i.why}{i.cookNote ? ` · ${i.cookNote}` : ''}</Text></View>
                    <Text style={{ color: colors.ink, fontSize: 12 }}>{i.quantity} {i.servingUnit} · {i.calories} kcal</Text>
                  </View>
                ))}
              </View>
            ) : null;
          })}
        </View>
      ))}
      {plan?.limits?.length > 0 && <Text style={[S.muted, { marginTop: 10 }]}>Variety kept: {plan.limits.slice(0, 5).map((l: any) => `${l.name} ${l.usedThisWeek}/${l.weeklyCap}× a week`).join(' · ')}</Text>}
    </View>
  );
}
