// One meal of one day in the planner: logged and planned foods together (labelled Logged / Planned), up to 3 add-on suggestions
// under it with "show more", and the chef: a hungry character for an empty meal, a comment in the character's voice otherwise.
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { PortionEdit } from './PortionEdit';
import { ServingsStepper } from './ServingsStepper';
import Buddy from '../motion/Buddy';
import type { Who } from '../motion/chars';
import { chefLine, STATUS_LABEL, type MealId, type ViewDay, type ViewItem } from '../utils/mealView';

const MEAL_LABEL: Record<MealId, string> = { breakfast: '🌅 Breakfast', lunch: '☀️ Lunch', dinner: '🌙 Dinner', snacks: '🍎 Snacks' };

const FEEDBACK: [string, string][] = [['loved', '😍 Loved it'], ['too_heavy', '😮‍💨 Too heavy'], ['too_long', '⏱️ Too long to cook'], ['not_available', '🛒 Not available']];

export function PlannerMeal({ day, meal, who, adding, onToggleAdd, onLog, onRemove, onAddSuggestion, onLogSuggestion, onLock, onFeedback, onEditQty, onLogMeal, plannedExtras, addPanel }: {
  day: ViewDay; meal: MealId; who: Who; adding: boolean; onToggleAdd: () => void;
  onLog: (i: ViewItem) => void; onRemove: (i: ViewItem) => void;
  onAddSuggestion: (s: ViewItem) => void; onLogSuggestion: (s: ViewItem) => void;
  onLock?: (locked: boolean) => void; onFeedback?: (i: ViewItem, kind: string) => void;
  onEditQty?: (i: ViewItem, quantity: number) => Promise<boolean>;
  onLogMeal?: () => void;
  plannedExtras?: (i: ViewItem) => React.ReactNode; addPanel?: React.ReactNode;
}) {
  const { S, colors } = useThemedStyles();
  const [more, setMore] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [fbFor, setFbFor] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [sv, setSv] = useState<Record<string, number>>({}); // servings chosen per suggestion before adding it
  const scaled = (s: ViewItem): ViewItem => { const n = sv[s.key || s.foodName] || 1; if (n === 1) return s; const k = (x: any) => Math.round((Number(x) || 0) * n * 10) / 10; return { ...s, quantity: Math.round(s.quantity * n * 100) / 100, calories: Math.round(s.calories * n), protein: k(s.protein), fiber: k(s.fiber), carbohydrates: k((s as any).carbohydrates), fat: k((s as any).fat) } as ViewItem; };
  const saveQty = async (i: ViewItem, q: number) => { setEditBusy(true); try { if (onEditQty && (await onEditQty(i, q))) setEditId(null); } finally { setEditBusy(false); } };
  const m = day.meals[meal];
  const ro = day.readOnly;
  const empty = m.items.length === 0;
  const badge = (st: ViewItem['status'], pending?: boolean) => (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, marginRight: 8, backgroundColor: st === 'logged' ? colors.primary : st === 'planned' ? colors.chipBg : colors.primarySoft, borderWidth: st === 'logged' ? 0 : 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 10.5, fontWeight: '800', color: st === 'logged' ? '#fff' : colors.ink }}>{STATUS_LABEL[st]}{pending ? ' · syncing' : ''}</Text>
    </View>
  );
  const line = (i: ViewItem) => `${i.quantity} ${i.servingUnit} · ${i.calories} kcal · ${i.protein} g protein`;
  const suggestions = more ? [...m.suggestions, ...m.more] : m.suggestions;

  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
      <View style={S.between}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{MEAL_LABEL[meal]}</Text>
          {m.total.calories > 0 && <Text style={S.muted}>{m.logged.calories} logged{m.planned.calories > 0 ? ` + ${m.planned.calories} planned` : ''} kcal · {m.total.protein} g protein</Text>}
        </View>
        {!ro && m.planned.calories > 0 && onLock && <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !!m.locked }} accessibilityLabel={m.locked ? `Unlock ${meal}` : `Lock ${meal} so it stays when you re-shuffle`} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => onLock(!m.locked)} style={{ marginRight: 14 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>{m.locked ? '🔒 Locked' : '🔓 Lock'}</Text></TouchableOpacity>}
        {!ro && onLogMeal && day.kind === 'today' && m.items.some((i) => i.status === 'planned' && !i.pending) && <View style={{ marginRight: 10 }}><Chip small label="✓ Log what I planned" onPress={onLogMeal} /></View>}
        {!ro && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Add food to ${meal}`} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={onToggleAdd}><Text style={{ color: colors.primary, fontWeight: '800' }}>{adding ? 'Close' : '+ Add'}</Text></TouchableOpacity>}
      </View>

      {!ro && !!m.why && (
        <View style={{ marginTop: 4 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: whyOpen }} onPress={() => setWhyOpen(!whyOpen)}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12.5 }}>💬 Why this plate?</Text></TouchableOpacity>
          {whyOpen && <Text style={{ marginTop: 4, padding: 8, borderRadius: 12, backgroundColor: colors.primarySoft, color: colors.ink, fontSize: 13.5 }}>{m.why}</Text>}
        </View>
      )}
      {!ro && day.plan?.out?.some((o) => o.meal === meal) && <Text style={[S.muted, { marginTop: 4 }]}>🍱 Eaten out{day.plan.out.find((o) => o.meal === meal)?.kind ? ` (${day.plan.out.find((o) => o.meal === meal)?.kind})` : ''}: aim for about {day.plan.out.find((o) => o.meal === meal)?.aim} kcal with protein, a carb and vegetables.</Text>}
      {!ro && day.plan?.fasted?.includes(meal) && <Text style={[S.muted, { marginTop: 4 }]}>🌙 Fasting window: nothing planned for this meal.</Text>}
      {empty && !ro && m.hint && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <Buddy scene="eat" size={46} who={who} talk={false} label="Hungry" />
          <Text style={{ flex: 1, color: colors.muted, fontSize: 13 }}>{chefLine(m.hint, who)}</Text>
        </View>
      )}
      {empty && ro && <Text style={[S.muted, { paddingVertical: 6 }]}>Nothing logged.</Text>}

      {m.items.map((i) => (
        <View key={i.id}>
          <View style={[S.row, { paddingVertical: 8 }]}>
            {badge(i.status, i.pending)}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{i.foodName}</Text>
              <Text style={S.muted}>{line(i)}{i.fromPlan ? ' · from your plan' : ''}{i.leftover ? ' · leftover, no cooking' : ''}{i.cookMin ? ` · ${i.cookMin} min` : ''}</Text>
              {!!i.cookNote && <Text style={S.muted}>👩‍🍳 {i.cookNote}</Text>}
            </View>
            {!ro && !!onEditQty && !i.pending && !String(i.id).startsWith('local:') && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit amount of ${i.foodName}`} onPress={() => setEditId(editId === i.id ? null : i.id)} style={{ marginRight: 12, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>✏️ Edit</Text></TouchableOpacity>}
            {!ro && i.status === 'planned' && day.kind === 'today' && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Log ${i.foodName}`} onPress={() => onLog(i)} style={{ marginRight: 12 }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Log</Text></TouchableOpacity>}
            {!ro && i.status === 'planned' && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${i.foodName}`} onPress={() => onRemove(i)}><Text style={S.delete}>✕</Text></TouchableOpacity>}
          </View>
          {editId === i.id && <PortionEdit name={i.foodName} foodId={i.foodId} quantity={i.quantity} unit={i.servingUnit} calories={i.calories} protein={i.protein} busy={editBusy} onCancel={() => setEditId(null)} onSave={(q) => saveQty(i, q)} />}
          {!ro && i.status === 'planned' && onFeedback && !i.pending && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: fbFor === i.id }} onPress={() => setFbFor(fbFor === i.id ? null : i.id)} style={{ paddingVertical: 4, marginRight: 10 }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>How was it?</Text></TouchableOpacity>
              {fbFor === i.id && FEEDBACK.map(([k, l]) => <Chip key={k} small label={l} onPress={() => { setFbFor(null); onFeedback(i, k); }} />)}
            </View>
          )}
          {!ro && i.status === 'planned' && plannedExtras?.(i)}
        </View>
      ))}

      {!ro && m.items.length > 0 && m.suggestions.length > 0 && (
        <View style={{ marginTop: 4, padding: 10, borderRadius: 14, backgroundColor: colors.primarySoft }}>
          <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 13 }}>💡 {m.addOnText ? m.addOnText.charAt(0).toUpperCase() + m.addOnText.slice(1) : 'Balance this meal'}</Text>
          {m.hint && m.hint.kind === 'partial' && <Text style={[S.muted, { marginTop: 2 }]}>{chefLine(m.hint, who)}</Text>}
          {suggestions.map((s0) => {
            const s = scaled(s0), key = s0.key || s0.foodName;
            return (
              <View key={key} style={{ paddingVertical: 6 }}>
                <View style={S.row}>
                  {badge('suggested')}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '700' }}>{s.foodName}</Text>
                    <Text style={S.muted}>{s.quantity} {s.servingUnit} · {s.calories} kcal · {s.protein} g protein · {s0.why}</Text>
                  </View>
                </View>
                <View style={[S.row, { marginTop: 4, justifyContent: 'space-between' }]}>
                  <ServingsStepper compact label={`Servings of ${s0.foodName}`} value={sv[key] || 1} onChange={(n) => setSv((x) => ({ ...x, [key]: n }))} />
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Add ${s.foodName} to the plan`} onPress={() => onAddSuggestion(s)} style={{ marginRight: 14, padding: 6 }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>+ Plan</Text></TouchableOpacity>
                    {day.kind === 'today' && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Log ${s.foodName} now`} onPress={() => onLogSuggestion(s)} style={{ padding: 6 }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Log</Text></TouchableOpacity>}
                  </View>
                </View>
              </View>
            );
          })}
          {m.more.length > 0 && <TouchableOpacity accessibilityRole="button" onPress={() => setMore(!more)} style={{ paddingTop: 6 }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>{more ? 'Show fewer' : `Show more (${m.more.length})`}</Text></TouchableOpacity>}
        </View>
      )}
      {addPanel}
    </View>
  );
}
