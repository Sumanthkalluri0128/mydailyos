// "Fix my day": a calm, specific plan for when today runs over. Same engine as the rest of the app:
// /api/plan/over-days (safe, capped spread), /api/food-logs (+ halve) and /api/plan/rescue-day. Never punishing.
import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';
import { read, write } from '../utils/offline';
import { post, today } from '../config/api';
import { useProfile } from '../hooks/useProfile';
import { useOverAdvice } from '../hooks/useOverAdvice';
import { walkKcal } from '../utils/overEngine';

const MEAL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const addDays = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

export function FixMyDay({ over, hour, onClose, onChanged }: { over: number; hour: number; onClose: () => void; onChanged?: () => void }) {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [logs, setLogs] = useState<any[] | null>(null);
  const [adv, setAdv] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const { profile } = useProfile();
  const eng = useOverAdvice(); // the same weekly-ledger engine as the Home card, so both always agree

  const load = useCallback(async () => {
    try { const b = await read<any>(`/api/food-logs?date=${today()}`); setLogs(b.logs || []); } catch { setLogs([]); }
    try { setAdv(await read<any>(`/api/plan/over-days?today=${today()}&tz=${new Date().getTimezoneOffset()}`)); } catch { /* optional */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const heavy = (logs || []).map((l) => ({ id: l._id, name: l.foodName, meal: l.mealType, kcal: Math.round(Number(l.nutritionTotal?.calories) || 0) }))
    .filter((l) => l.kcal >= 150).sort((a, b) => b.kcal - a.kcal).slice(0, 3);

  const halve = async (it: { id: string; name: string }) => {
    setBusy(it.id);
    try { await write('PATCH', `/api/food-logs/${it.id}`, { halve: true }, `Halve ${it.name}`); success('Updated', `${it.name} set to half a portion.`); onChanged?.(); load(); }
    catch (e: any) { error('Could not update that entry', e?.message); } finally { setBusy(''); }
  };
  const rescue = async () => {
    setBusy('plan');
    try { const r: any = await post('/api/plan/rescue-day', { date: addDays(today(), 1), today: today() }); success('Gentle day planned', `Tomorrow is set at about ${r.goal} kcal${r.fixedMeals?.length ? `, around the ${r.fixedMeals.join(' and ')} you already logged` : ''}.`); onClose(); router.push('/plan' as any); }
    catch (e: any) { error('Could not plan it', e?.message); } finally { setBusy(''); }
  };

  const btn = (label: string, onPress: () => void, o: { ghost?: boolean; disabled?: boolean } = {}) => (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={o.disabled} style={{ minHeight: 46, borderRadius: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: o.ghost ? colors.chipBg : colors.primary, opacity: o.disabled ? 0.55 : 1 }}>
      <Text style={{ color: o.ghost ? colors.ink : '#fff', fontWeight: '800', fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );

  if (over <= 0) return <View style={{ gap: 12 }}><Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22 }}>You are back within today’s budget. Nothing to fix. 🎉</Text>{btn('Done', onClose)}</View>;

  const c = adv?.correction;
  const serverNew = adv?.engine === 'ledger-v1';
  const a = serverNew ? (adv?.advice || null) : (eng?.advice || null);
  const cycle = (serverNew ? adv?.cause : eng?.cause) === 'undereating_cycle';
  const late = hour >= 21 || hour < 5;
  const steps: [string, string][] = [
    cycle
      ? ['Do not skip meals to make up for it', 'This heavy day came after a very light one. Eat regular meals, with protein in each, so hunger stays steady. Restricting again is what sets up the next big day.']
      : [late ? 'It’s late: keep it simple' : 'Rest of today: keep it light', late ? 'Skip extra snacks, sip water and sleep well. A good night helps hunger tomorrow.' : 'Clear soup, salad, curd or buttermilk. If you are not hungry, skip the extra snack.'],
    ['Walk for 15 minutes', `Burns about ${walkKcal(profile?.currentWeightKg)} kcal at your weight and helps digestion. It does not cancel the food, so treat it as a bonus. Log the steps after.`],
    a ? [a.skipCut ? 'No cutting needed' : `Tomorrow: about ${a.perDay} kcal lighter, for ${a.days} day${a.days > 1 ? 's' : ''}`, `${a.headline} ${a.detail}`]
      : [c?.safe ? `Tomorrow: about ${c.perDay} kcal lighter, for ${c.days} days` : 'No cutting needed', c ? c.note : 'Eat your normal plan tomorrow. A small overshoot does not need paying back.'],
  ];
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.ink, fontSize: 14.5, lineHeight: 21 }}><Text style={{ fontWeight: '900' }}>{over.toLocaleString()} kcal over.</Text> One day barely moves your weight, so no punishing. Here is a calm way to handle it.</Text>
      {steps.map(([t, d], i) => (
        <View key={t} style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.chipBg }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primarySolid, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>{i + 1}</Text></View>
          <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontWeight: '800', fontSize: 14.5 }}>{t}</Text><Text style={[S.muted, { marginTop: 2, fontSize: 13, lineHeight: 19 }]}>{d}</Text></View>
        </View>
      ))}
      {heavy.length > 0 && (
        <View>
          <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 14 }}>Check your log</Text>
          <Text style={[S.muted, { fontSize: 12.5, marginBottom: 4 }]}>If any portion was smaller than what you logged, correct it so the numbers stay honest.</Text>
          {heavy.map((it) => (
            <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{it.name}</Text><Text style={S.muted}>{MEAL[it.meal] || it.meal} · {it.kcal} kcal</Text></View>
              <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={() => halve(it)} style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.chipBg, opacity: busy ? 0.5 : 1 }}>
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12.5 }}>{busy === it.id ? '…' : `Was half · −${Math.round(it.kcal / 2)}`}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {btn('🌿 Plan a gentle day for tomorrow', rescue, { disabled: !!busy })}
      {btn('Close', onClose, { ghost: true })}
    </View>
  );
}
