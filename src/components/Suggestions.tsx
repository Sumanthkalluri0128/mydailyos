import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';
import { get, post, today } from '../config/api';
import { write } from '../utils/offline';

type SFood = { _id: string; name: string; servingSize: number; servingUnit: string; calories: number; protein?: number; carbohydrates?: number; fat?: number; fiber?: number; sugar?: number };
type Data = {
  mode: 'meal' | 'light' | 'over';
  remaining: { calories: number; protein: number; fiber: number };
  caps: { carbs: number | null; fat: number | null; protein: number | null; fiber: number | null };
  suggestions: { food: SFood; reason: string }[];
  meals: { items: { food: SFood; servings: number; label: string }[]; totals: { calories: number; protein: number; carbohydrates: number; fat: number }; reason: string }[];
  light: { food: SFood | null; name: string; kcal: number; tip: string }[];
  makeItFit: { logId: string; name: string; kind: 'swap' | 'half'; to: string; saves: number; afterOver: number; why: string }[];
  message: string;
  fresh?: { food: SFood; reason: string }[];
  healthy?: { name: string; unit: string; size: number; kcal: number; protein: number; fiber: number; note: string }[];
};

/** What fits what is left today. Whole plates when there is room, very light options when you are nearly out or over (the old version
 *  went blank exactly then), and "make it fit" swaps of what you already logged. One tap logs a serving / a plate. */
export function Suggestions({ meal, refreshKey, onLogged }: { meal: string; refreshKey: number; onLogged: () => void }) {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    get<Data>(`/api/foods/suggest?date=${today()}&mealType=${meal}`).then((d) => alive && setData(d)).catch(() => alive && setData(null));
    return () => { alive = false; };
  }, [meal, refreshKey]);

  if (!data) return null;
  const nothing = !data.suggestions?.length && !data.fresh?.length && !data.healthy?.length && !data.meals?.length && !data.light?.length && !data.makeItFit?.length;
  if (nothing) return null;

  const logFood = async (food: SFood, servings = 1) => {
    const ratio = servings;
    const quantity = food.servingSize * servings;
    await write('POST', '/api/food-logs', { foodId: food._id, date: today(), mealType: meal, quantity, clientId: `sg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, food.name, {
      foodName: food.name, consumedQuantity: quantity, servingUnit: food.servingUnit, servings: ratio,
      nutritionTotal: { calories: food.calories * ratio, protein: (food.protein || 0) * ratio, carbohydrates: (food.carbohydrates || 0) * ratio, fat: (food.fat || 0) * ratio, fiber: (food.fiber || 0) * ratio, sugar: (food.sugar || 0) * ratio },
    });
  };
  const addOne = async (food: SFood) => { try { await logFood(food); success('Added', `${food.name} → ${meal}`); onLogged(); } catch (e: any) { error('Could not add', e.message); } };
  const addNew = async (h: NonNullable<Data['healthy']>[number]) => {
    try { const r: any = await post('/api/foods/adopt', { name: h.name }); await logFood(r.food); success('Added', `${h.name} → ${meal}. It is now in My Foods too.`); onLogged(); }
    catch (e: any) { error('Could not add', e.message); }
  };
  const addPlate = async (items: Data['meals'][number]['items']) => {
    try { for (const it of items) await logFood(it.food, it.servings); success('Added', `${items.map((i) => i.label).join(' + ')} → ${meal}`); onLogged(); }
    catch (e: any) { error('Could not add', e.message); }
  };
  const applyFit = async (o: Data['makeItFit'][number]) => {
    try {
      if (o.kind === 'half') await write('PATCH', `/api/food-logs/${o.logId}`, { halve: true }, `Halve ${o.name}`);
      success(o.kind === 'half' ? 'Tip' : 'Tip', o.kind === 'swap' ? `Next time try ${o.to}. It saves about ${o.saves} kcal.` : `Halving ${o.name} would save about ${o.saves} kcal.`);
    } catch (e: any) { error('Could not change it', e.message); }
  };

  const caps = [data.caps?.carbs !== null && data.caps?.carbs !== undefined && `carbs up to ${data.caps.carbs} g`, data.caps?.fat !== null && data.caps?.fat !== undefined && `fat up to ${data.caps.fat} g`].filter(Boolean).join(' · ');
  const gaps = [data.remaining.protein > 0 && `${data.remaining.protein} g protein`, data.remaining.fiber > 0 && `${data.remaining.fiber} g fibre`].filter(Boolean).join(' · ');
  const row = (key: string, title: string, sub: string, onPress?: () => void, plus = true) => (
    <TouchableOpacity key={key} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={!onPress} style={[S.row, { minHeight: 48, borderTopWidth: 1, borderTopColor: colors.border }]}>
      <View style={{ flex: 1, paddingVertical: 8 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{title}</Text><Text style={S.muted}>{sub}</Text></View>
      {plus && onPress ? <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 20 }}>＋</Text> : null}
    </TouchableOpacity>
  );

  return (
    <View style={S.card}>
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>{data.mode === 'over' ? '🌿 Still helpful when you are over' : '💡 Suggested for you'}</Text>
      <Text style={[S.muted, { marginBottom: 8 }]}>
        {data.mode === 'over' ? data.message : `${data.remaining.calories} kcal left${gaps ? ` · still to go: ${gaps}` : ''}${caps ? ` · ${caps}` : ''}`}
      </Text>

      {data.meals?.length > 0 && <Text style={[S.label, { marginTop: 4 }]}>Whole plates that fit</Text>}
      {data.meals?.map((m, i) => row(`m${i}`, m.items.map((x) => x.label).join(' + '), m.reason, () => addPlate(m.items)))}

      {data.light?.length > 0 && <Text style={[S.label, { marginTop: 8 }]}>Very light options</Text>}
      {data.light?.map((l, i) => row(`l${i}`, l.name, `${l.kcal} kcal · ${l.tip}`, l.food ? () => addOne(l.food as SFood) : undefined))}

      {data.makeItFit?.length > 0 && <Text style={[S.label, { marginTop: 8 }]}>Make it fit</Text>}
      {data.makeItFit?.map((o, i) => row(`f${i}`, `${o.name}: ${o.kind === 'swap' ? `swap to ${o.to}` : 'half portion'}`, `saves about ${o.saves} kcal${o.afterOver > 0 ? ` · still ${o.afterOver} over` : ' · fits your budget'} · ${o.why}`, () => applyFit(o), false))}

      {(!!data.healthy?.length || !!data.fresh?.length) && <Text style={[S.label, { marginTop: 8 }]}>✨ Try something new (not on your list)</Text>}
      {data.healthy?.map((h) => row(`h-${h.name}`, h.name, `${h.kcal} kcal · ${h.protein} g protein · ${h.note}`, () => addNew(h)))}
      {data.fresh?.map(({ food, reason }) => row(`n-${food._id}`, food.name, `${food.servingSize} ${food.servingUnit} · ${reason}`, () => addOne(food)))}

      {data.suggestions?.length > 0 && <Text style={[S.label, { marginTop: 8 }]}>Single foods</Text>}
      {data.suggestions?.map(({ food, reason }) => row(food._id, food.name, `${food.servingSize} ${food.servingUnit} · ${reason}`, () => addOne(food)))}
    </View>
  );
}
