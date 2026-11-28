import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RefreshControl, Share, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { tourRef } from '../tour/anchors';
import { Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { FoodSearch } from '../components/FoodSearch';
import { AutoPlan } from '../components/AutoPlan';
import { SenseiChat } from '../components/SenseiChat';
import { IntakeBanner } from '../components/IntakeBanner';
import { useNotifications } from '../components/Notifications';
import { del, get, post, today, newClientId } from '../config/api';
import { read, write } from '../utils/offline';
import { PlannerMeal } from '../components/PlannerMeal';
import Buddy from '../motion/Buddy';
import { Confetti } from '../motion/Confetti';
import { dayChar } from '../motion/chars';
import { chefDayLine, dayBarText, itemsToLog, itemsToLogMeal, MEAL_IDS, planViewPath, type MealId, type PlanView, type ViewItem } from '../utils/mealView';

const MEALS: [string, string][] = [['breakfast', '🌅 Breakfast'], ['lunch', '☀️ Lunch'], ['dinner', '🌙 Dinner'], ['snacks', '🍎 Snacks']];
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const mondayOf = (s: string) => addDays(s, -((parse(s).getDay() + 6) % 7));
const short = (s: string) => parse(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
const long = (s: string) => parse(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function Plan() {
  const { S, colors } = useThemedStyles();
  const { error, success, confirm, undoableDelete } = useNotifications();
  const [start, setStart] = useState(mondayOf(today()));
  const [day, setDay] = useState(today());
  const [view, setView] = useState<PlanView | null>(null);
  const [cheer, setCheer] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [shop, setShop] = useState<any | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [improve, setImprove] = useState(false);
  const [tpls, setTpls] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null); // when this week's data last arrived
  const [auto, setAuto] = useState(false);
  const [swap, setSwap] = useState<{ id: string; alts: any[] | null } | null>(null);
  const end = addDays(start, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  const who = dayChar();
  const dayRef = useRef(day); dayRef.current = day;
  // ONE response: logged + planned merged, day bar, suggestions. It is cached, and queued offline writes are layered on top (read()).
  const load = useCallback(async () => {
    try {
      const v = await read<PlanView>(planViewPath(start, today()));
      setView((prev) => {
        const was = prev?.days.find((d) => d.date === dayRef.current)?.complete;
        const now = v.days.find((d) => d.date === dayRef.current)?.complete;
        if (now && was === false) setCheer((c) => c + 1);   // finishing a day plays the victory scene
        return v;
      });
      setUpdatedAt(Date.now());
    } catch (e: any) { error('Could not load your plan', e.network ? 'You are offline and this week has not been opened before.' : e.message); }
    finally { setRefreshing(false); }
  }, [start, error]);
  useEffect(() => { load(); setShop(null); }, [load]);
  // Coming back to the planner (from the food log, Home, a notification) always shows what was logged or planned meanwhile.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => { if (firstFocus.current) { firstFocus.current = false; return; } load(); }, [load]));

  const run = async (fn: () => Promise<any>, ok?: string) => {
    try { const r = await fn(); if (ok) success('Done', ok); await load(); return r; }
    catch (e: any) { error('Something went wrong', e.network ? 'Planning needs a connection.' : e.message); return null; }
  };

  const vd = view?.days.find((d) => d.date === day);
  const rg = view?.ctx?.ranges;
  const bar = vd?.budget;
  const pct = bar && bar.budget ? Math.min(1.3, bar.eaten / bar.budget) : 0;
  const hasPlanned = !!vd && !vd.readOnly && MEAL_IDS.some((m) => vd.meals[m].planned.calories > 0);
  const hasDot = (d: string) => !!view?.days.find((x) => x.date === d && MEAL_IDS.some((m) => x.meals[m].items.length));

  const CK = 'ff-shop-checked', CACHE = 'ff-shop-cache';
  const jget = async (k: string, d: any) => { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const jset = (k: string, v: any) => { AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {}); };
  const openShop = async (force?: boolean) => {
    if (shop && force !== true) { setShop(null); return; }
    try { const d = await get<any>(`/api/meal-plans/shopping-list?from=${start}&to=${end}`); setShop(d); setChecked(await jget(CK, {})); jset(CACHE, d); }
    catch (e: any) {
      const c = await jget(CACHE, null);
      if (c) { setShop({ ...c, offline: true }); setChecked(await jget(CK, {})); } else error('Could not build the list', e.network ? 'The list needs a connection the first time.' : e.message);
    }
  };
  const tick = (i: any) => { const next = { ...checked, [i.foodId]: !checked[i.foodId] }; setChecked(next); jset(CK, next); if (next[i.foodId]) success('In the bag', `${i.name} ✓`); };
  const haveIt = async (i: any, have: boolean) => {
    try { await post('/api/meal-plans/shopping-list/have', { name: i.name, have }); } catch (e: any) { error('Could not save that', e.network ? 'This needs a connection.' : e.message); return; }
    openShop(true);
  };
  const lockMeal = (date: string, mealType: string) => (locked: boolean) => run(() => post('/api/meal-plans/lock', { date, mealType, locked }), locked ? 'Locked. It stays when you re-shuffle.' : 'Unlocked.');
  const giveFeedback = async (i: ViewItem, kind: string) => {
    try {
      await post('/api/food-prefs/feedback', { planId: i.id, kind });
      success('Noted', ({ loved: 'You will see this one more often.', too_heavy: 'I will go lighter next time.', too_long: 'I will pick quicker foods.', not_available: 'I will leave it out for a few weeks.' } as any)[kind]);
    } catch (e: any) { error('Could not save that', e.network ? 'Needs a connection.' : e.message); }
  };
  const resetFeedback = async () => { if (!(await confirm({ title: 'Reset what I learned?', message: 'Your loved / too heavy / too long / not available choices are cleared.', confirmText: 'Reset' }))) return; try { await del('/api/food-prefs/feedback'); success('Done', 'Feedback reset.'); } catch (e: any) { error('Could not reset', e.message); } };
  const loadTemplates = async () => { try { setTpls((await get<any>('/api/meal-plans/templates')).templates || []); } catch (e: any) { error('Could not load templates', e.message); } };
  const saveTemplate = () => {
    const name = `Week of ${long(start)}`;
    post<any>('/api/meal-plans/templates', { name, from: start }).then((d) => { success(d.replaced ? 'Template updated' : 'Template saved', name); loadTemplates(); }).catch((e: any) => error('Could not save the template', e.message));
  };
  const applyTemplate = async (t: any, replace: boolean) => {
    try {
      const d = await post<any>(`/api/meal-plans/templates/${t.id}/apply`, { from: start, today: today(), replace });
      success('Loaded', `${d.saved} foods${d.skipped?.length ? `. Skipped ${d.skipped.map((x: any) => `${x.name} (${x.reason})`).join(', ')}` : ''}.`); await load();
    } catch (e: any) { error('Could not load it', e.message); }
  };
  const deleteTemplate = (t: any) => {
    const before = tpls;
    setTpls((cur) => (cur || []).filter((x) => x.id !== t.id));
    undoableDelete(`"${t.name}" removed`, async () => { try { await del(`/api/meal-plans/templates/${t.id}`); loadTemplates(); } catch (e: any) { setTpls(before); error('Could not delete', e.message); } }, () => setTpls(before));
  };
  const shopText = () => {
    const lines = [`Grocery list (${long(start)} – ${long(end)})`];
    for (const g of shop?.aisles || []) {
      const rows = g.items.filter((x: any) => !checked[x.foodId]);
      if (!rows.length) continue;
      lines.push('', String(g.aisle).toUpperCase(), ...rows.map((x: any) => `[ ] ${x.name}: ${x.quantity} ${x.unit}${x.approx ? ` (about ${x.approx.count} ${x.approx.label})` : ''}`));
    }
    if (shop?.alreadyHave?.length) lines.push('', `Already at home: ${shop.alreadyHave.map((x: any) => x.name).join(', ')}`);
    return lines.join('\n');
  };

  const copyWeek = async () => {
    if (!(await confirm({ title: 'Copy last week’s plan here?', message: 'Everything planned last week is added to this week.', confirmText: 'Copy' }))) return;
    const r = await run(() => post<any>('/api/meal-plans/copy-week', { fromStart: addDays(start, -7), toStart: start }));
    if (r) {
      const there = r.alreadyThere ? ` (${r.alreadyThere} already planned, not added twice)` : '';
      success('Copied', r.copied ? `${r.copied} planned items copied${there}.` : r.alreadyThere ? 'This week already has everything from last week.' : 'Last week had nothing planned.');
    }
  };

  const planDay = async () => {
    const r = await run(() => post<any>('/api/meal-plans/auto', { from: day, days: 1, today: today(), mode: 'balanced' }));
    if (r) success('Day planned', `${r.saved} foods planned for ${short(day)}.`);
  };
  const clearDay = async () => {
    if (!(await confirm({ title: `Clear ${short(day)}?`, message: 'Removes what is planned and not yet eaten on this day.', confirmText: 'Clear', destructive: true }))) return;
    await run(() => post('/api/meal-plans/clear', { from: day }), 'Day cleared.');
  };
  const clearWeek = async () => {
    if (!(await confirm({ title: 'Clear this whole week?', message: 'Removes everything planned and not yet eaten from this week.', confirmText: 'Clear week', destructive: true }))) return;
    await run(() => post('/api/meal-plans/clear', { from: start, to: end }), 'Week cleared.');
  };
  // A logged food edits the food log; a planned one edits the plan. Resolves true when saved.
  const editQty = async (i: ViewItem, quantity: number): Promise<boolean> => {
    const send = async (q: number) => {
      if (i.status === 'logged') await write('PATCH', `/api/food-logs/${i.id}`, { quantity: q }, `Change ${i.foodName}`);
      else await write('PATCH', `/api/meal-plans/${i.id}`, { quantity: q, today: today() }, `Change ${i.foodName}`);
    };
    try {
      const before = i.quantity;
      await send(quantity);
      await run(async () => {});
      // already saved: Undo (5 s) puts the old amount back
      undoableDelete(`${i.foodName} is now ${quantity} ${i.servingUnit}`, () => {}, async () => { try { await send(before); } catch { /* shown on reload */ } await load(); });
      return true;
    } catch (e: any) { error('Could not change the amount', e.network ? 'You are offline. Try again when you are back online.' : e.message); return false; }
  };
  const resize = (i: ViewItem, f: number) => run(() => write('PATCH', `/api/meal-plans/${i.id}`, { quantity: Math.max(0.1, Math.round(i.quantity * f * 10) / 10) }, `Resize ${i.foodName}`));
  // ---- logging, offline-safe: every action goes through the existing write queue and is shown straight away
  const logPlanned = async (i: ViewItem, quiet = false) => {
    const d = vd?.date || day;
    try {
      await write('POST', `/api/meal-plans/${i.id}/log`, { date: d, clientId: `pl-${i.id}` }, `Log ${i.foodName}`, {
        foodName: i.foodName, mealType: i.mealType, foodId: i.foodId, date: d, consumedQuantity: i.quantity, servingUnit: i.servingUnit,
        nutritionTotal: { calories: i.calories, protein: i.protein, fiber: i.fiber, carbohydrates: i.carbohydrates || 0, fat: i.fat || 0 },
      });
      if (!quiet) { success('Logged', `${i.foodName} is eaten.`); await load(); }
    } catch (e: any) { error('Could not log it', e.message); }
  };
  const logDay = async () => {
    // Items already logged (or already waiting to sync) are skipped, so nothing is counted twice.
    const todo = itemsToLog(vd);
    if (!todo.length) { success('Nothing to log', 'Everything planned for this day is already logged.'); return; }
    for (const i of todo) await logPlanned(i, true);
    success('Logged', `${todo.length} planned food${todo.length === 1 ? '' : 's'} logged.`);
    await load();
  };
  // One tap: log every planned item of ONE meal at its planned portion. Each item keeps its Edit button afterwards.
  const logMeal = async (meal: MealId) => {
    const todo = itemsToLogMeal(vd, meal);
    if (!todo.length) { success('Nothing to log', 'Everything planned for this meal is already logged.'); return; }
    for (const i of todo) await logPlanned(i, true);
    success('Logged', `${todo.length} planned food${todo.length === 1 ? '' : 's'} logged. Tap Edit on any of them to change the amount.`);
    await load();
  };
  const planSuggestion = async (s: ViewItem) => {
    try {
      if (s.foodId) {
        await write('POST', '/api/meal-plans', { date: day, mealType: s.mealType, foodId: s.foodId, quantity: s.quantity, today: today(), why: s.why, clientId: newClientId('pa') }, `Plan ${s.foodName}`, { foodName: s.foodName, servingUnit: s.servingUnit, why: s.why, nutrition: { calories: s.calories, protein: s.protein, fiber: s.fiber, carbohydrates: s.carbohydrates || 0, fat: s.fat || 0 } });
      } else await post('/api/meal-plans', { date: day, mealType: s.mealType, name: s.foodName, quantity: s.quantity, today: today(), why: s.why, clientId: newClientId('pa') }); // a new healthy food needs a connection (it is added to My Foods first)
      success('Added to plan', `${s.foodName} → ${s.mealType}`);
      await load();
    } catch (e: any) { error('Could not add it', e.network ? 'This food is new to your list, so it needs a connection.' : e.message); }
  };
  const logSuggestion = async (s: ViewItem) => {
    try {
      let foodId = s.foodId;
      if (!foodId) { const r: any = await post('/api/foods/adopt', { name: s.foodName }); foodId = r.food._id; }
      await write('POST', '/api/food-logs', { foodId, date: today(), mealType: s.mealType, quantity: s.quantity, clientId: newClientId('sg') }, s.foodName, {
        foodName: s.foodName, consumedQuantity: s.quantity, servingUnit: s.servingUnit, servings: 1,
        nutritionTotal: { calories: s.calories, protein: s.protein, fiber: s.fiber, carbohydrates: s.carbohydrates || 0, fat: s.fat || 0 },
      });
      success('Logged', `${s.foodName} → ${s.mealType}`);
      await load();
    } catch (e: any) { error('Could not log it', e.network ? 'This food is new to your list, so it needs a connection.' : e.message); }
  };

  const openSwap = async (i: ViewItem) => {
    if (swap?.id === i.id) { setSwap(null); return; }
    setSwap({ id: i.id, alts: null }); setMoving(null);
    try { const r = await get<any>(`/api/meal-plans/${i.id}/alternatives?today=${today()}`); setSwap({ id: i.id, alts: r.items || [] }); }
    catch (e: any) { setSwap(null); error('Could not find swaps', e.message); }
  };
  const doSwap = async (i: ViewItem, a: any) => { setSwap(null); await run(() => post(`/api/meal-plans/${i.id}/swap`, { foodId: a.foodId || undefined, name: a.foodId ? undefined : a.name, servings: a.servings }), `Swapped to ${a.name}.`); };

  return (
    <Screen buddy="plan" buddySays="Plan the week!" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Meal planner</Text>
      <Text style={S.sub}>Plan the week, log with one tap, get a shopping list.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh the planner" onPress={() => { setRefreshing(true); load(); }} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
        <Text style={S.muted}>{updatedAt ? `Last updated ${new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Loading…'} · Tap or pull down to refresh</Text>
      </TouchableOpacity>
      <IntakeBanner showPlanLink={false} />

      <View style={[S.between, { marginBottom: 10 }]}>
        <TouchableOpacity accessibilityLabel="Previous week" onPress={() => { setStart(addDays(start, -7)); setDay(addDays(start, -7)); }} style={{ padding: 10 }}><Text style={{ color: colors.primary, fontSize: 22, fontWeight: '800' }}>‹</Text></TouchableOpacity>
        <Text style={{ color: colors.ink, fontWeight: '800' }}>{long(start)} – {long(end)}</Text>
        <TouchableOpacity accessibilityLabel="Next week" onPress={() => { setStart(addDays(start, 7)); setDay(addDays(start, 7)); }} style={{ padding: 10 }}><Text style={{ color: colors.primary, fontSize: 22, fontWeight: '800' }}>›</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((d) => <Chip key={d} small label={`${short(d)}${hasDot(d) ? ' •' : ''}`} active={d === day} onPress={() => setDay(d)} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        <View ref={tourRef('planner-plan')} testID="tour-planner-plan" collapsable={false}><Chip small label="✨ Plan my week" active={auto} onPress={() => setAuto(!auto)} /></View>
        <Chip small label="This week" onPress={() => { setStart(mondayOf(today())); setDay(today()); }} />
        <Chip small label="Copy last week" onPress={copyWeek} />
        <Chip small label="🛒 Shopping list" active={!!shop} onPress={() => openShop()} />
        <Chip small label="📑 Templates" active={!!tpls} onPress={() => (tpls ? setTpls(null) : loadTemplates())} />
        <Chip small label="🍲 Recipes" onPress={() => router.push('/recipes' as any)} />
        <Chip small label="🗑️ Clear week" onPress={clearWeek} />
      </View>

      {view?.ctx?.sensei && !auto && !improve && (!view.ctx.sensei.setupDone || view.ctx.sensei.improve > 0) && (
        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{view.ctx.sensei.setupDone ? 'Improve my plan' : 'Plan with the sensei'}</Text>
          <Text style={[S.muted, { marginVertical: 4 }]}>{view.ctx.sensei.setupDone ? 'A couple of quick questions keep your plan right for this week.' : 'Answer a few quick questions and I will build a plan around your food, time and kitchen.'}</Text>
          <Chip small label={view.ctx.sensei.setupDone ? 'Improve my plan' : 'Start'} onPress={() => setImprove(true)} />
        </View>
      )}
      {improve && <SenseiChat onClose={() => { setImprove(false); load(); }} onDone={() => { setImprove(false); setAuto(true); load(); }} />}
      {view?.ctx?.safety?.flagged && (
        <View style={{ padding: 10, borderRadius: 12, backgroundColor: '#e5484d14', borderWidth: 1, borderColor: '#e5484d66', marginBottom: 8 }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>🩺 Please check with a doctor or dietitian</Text><Text style={S.muted}>{view.ctx.safety.note}</Text>
        </View>
      )}
      {auto && <AutoPlan from={start} to={end} onClose={() => setAuto(false)} onSaved={(o) => { load(); if (o?.shop) setTimeout(() => openShop(true), 400); }} />}
      {tpls && (
        <View style={S.card}>
          <View style={S.between}><Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>📑 Week templates</Text><Chip small label="Save this week" onPress={saveTemplate} /></View>
          {!tpls.length && <Text style={S.muted}>No templates yet.</Text>}
          {tpls.map((t) => (
            <View key={t.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{t.name}</Text>
              <Text style={S.muted}>{t.days} day{t.days === 1 ? '' : 's'} · about {t.kcalPerDay} kcal a day</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                <Chip small label="Load into empty meals" onPress={() => applyTemplate(t, false)} /><Chip small label="Replace this week" onPress={() => applyTemplate(t, true)} /><Chip small label="Delete" onPress={() => deleteTemplate(t)} />
              </View>
            </View>
          ))}
          <TouchableOpacity accessibilityRole="button" onPress={resetFeedback} style={{ paddingTop: 8 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Reset what the sensei learned from my feedback</Text></TouchableOpacity>
        </View>
      )}

      {shop && (
        <View style={S.card}>
          <View style={S.between}><Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>🛒 Shopping list</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => Share.share({ message: shopText() })}><Text style={{ color: colors.primary, fontWeight: '800' }}>Share</Text></TouchableOpacity></View>
          <Text style={[S.muted, { marginBottom: 6 }]}>Planned and not yet eaten, this week</Text>
          {shop.people?.scaled && <Text style={[S.muted, { marginBottom: 6 }]}>Scaled for {shop.people.adults} adult{shop.people.adults === 1 ? '' : 's'}{shop.people.kids ? `, ${shop.people.kids} kid${shop.people.kids === 1 ? '' : 's'}` : ''}{shop.people.elders ? `, ${shop.people.elders} elder${shop.people.elders === 1 ? '' : 's'}` : ''} (about {shop.people.factor} portions; estimates).</Text>}
          {!shop.items.length && <Text style={S.muted}>Nothing to buy — plan some meals first.</Text>}
          {shop.offline && <Text style={[S.muted, { marginBottom: 6 }]}>Showing the last list you loaded (offline).</Text>}
          {(shop.aisles || []).map((g: any) => (
            <View key={g.aisle} style={{ marginTop: 6 }}>
              <Text style={S.label}>{g.aisle}</Text>
              {g.items.map((i: any) => (
                <View key={i.foodId} style={[S.between, { paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: !!checked[i.foodId] }} accessibilityLabel={`${i.name}, ${i.quantity} ${i.unit}`} onPress={() => tick(i)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
                    <Text style={{ color: checked[i.foodId] ? colors.muted : colors.ink, fontWeight: '600', textDecorationLine: checked[i.foodId] ? 'line-through' : 'none' }}>{checked[i.foodId] ? '☑ ' : '☐ '}{i.name}</Text>
                    <Text style={S.muted}>{i.quantity} {i.unit}{i.approx ? ` · ≈ ${i.approx.count} ${i.approx.label}` : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`I already have ${i.name}`} onPress={() => haveIt(i, true)} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 8 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Have it</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          ))}
          {shop.alreadyHave?.length > 0 && <Text style={[S.muted, { marginTop: 8 }]}>You already have: {shop.alreadyHave.map((i: any) => i.name).join(', ')} (not on the list).</Text>}
          {shop.alreadyHave?.map((i: any) => <TouchableOpacity key={`nb-${i.foodId}`} accessibilityRole="button" onPress={() => haveIt(i, false)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary }}>Need to buy {i.name}</Text></TouchableOpacity>)}
          {shop.items.length > 0 && shop.items.every((i: any) => checked[i.foodId]) && <View style={{ alignItems: 'center', marginTop: 8 }}><Buddy scene="cheer" size={64} says="Bag packed!" /></View>}
        </View>
      )}

      {vd && (
        <View style={S.card}>
          <View style={S.between}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>{short(day)}{vd.kind === 'today' ? ' · today' : vd.readOnly ? ' · history' : ''}</Text>
              {vd.hasBudget && bar && (() => { const t = dayBarText(bar); return <Text style={[S.muted, t.over && { color: colors.danger }]}>{t.eaten} · {t.planned} · {t.remaining} kcal{bar.trim > 0 ? ` (lighter day, −${bar.trim})` : ''}</Text>; })()}
            </View>
            {!vd.readOnly && vd.kind === 'today' && MEAL_IDS.some((m) => vd.meals[m].planned.calories > 0) && <Chip small label="Log day" onPress={logDay} />}
          </View>
          {!!bar && bar.budget > 0 && (
            <View style={{ height: 8, borderRadius: 99, backgroundColor: colors.chipBg, overflow: 'hidden', marginTop: 8, flexDirection: 'row' }}>
              <View style={{ width: `${Math.min(100, (bar.eaten / bar.budget) * 100)}%`, height: 8, backgroundColor: bar.remaining < 0 ? colors.danger : colors.primary }} />
              <View style={{ width: `${Math.max(0, Math.min(100 - (bar.eaten / bar.budget) * 100, (bar.planned / bar.budget) * 100))}%`, height: 8, backgroundColor: colors.primarySoft }} />
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <View><Buddy scene={vd.complete ? 'victory' : 'chef'} size={52} who={who} talk={false} label="Chef" /><Confetti fire={cheer} /></View>
            <Text style={{ flex: 1, color: colors.ink, fontSize: 13.5, lineHeight: 19 }}>{chefDayLine(vd, who) || (vd.readOnly ? 'This day is history. It shows what you logged.' : '')}</Text>
          </View>
          {vd.total.calories > 0 && (
            <Text style={[S.muted, { marginTop: 6 }]}>
              Protein {Math.round(vd.total.protein)} g{rg ? ` (aim ${rg.protein.min}–${rg.protein.max})` : ''} · Carbs {Math.round(vd.total.carbohydrates)} g · Fat {Math.round(vd.total.fat)} g · Fibre {Math.round(vd.total.fiber * 10) / 10} g{rg ? ` (aim ${rg.fiber.goal}+)` : ''}
              {rg && !vd.readOnly && vd.total.protein > 0 && vd.total.protein < rg.protein.min ? '\n⚠️ Protein is low for this day. Try an add-on below.' : ''}
            </Text>
          )}
          {!vd.readOnly && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              <Chip small label="✨ Plan this day" onPress={planDay} />
              {hasPlanned && <Chip small label="🗑️ Clear day" onPress={clearDay} />}
            </View>
          )}

          {MEAL_IDS.map((id) => {
            const key = `${day}|${id}`;
            return (
              <PlannerMeal key={id} day={vd} meal={id} who={who} adding={adding === key} onToggleAdd={() => setAdding(adding === key ? null : key)} onLock={lockMeal(vd.date, id)} onFeedback={giveFeedback} onEditQty={editQty} onLogMeal={() => logMeal(id)}
                onLog={logPlanned} onRemove={(i) => run(() => write('DELETE', `/api/meal-plans/${i.id}`, {}, `Remove ${i.foodName}`))} onAddSuggestion={planSuggestion} onLogSuggestion={logSuggestion}
                plannedExtras={(i) => (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={[S.muted, { marginRight: 8 }]}>Portion</Text>
                      <Chip small label="− 25%" onPress={() => resize(i, 0.75)} /><Chip small label="+ 25%" onPress={() => resize(i, 1.25)} />
                      <Chip small label="Swap" onPress={() => openSwap(i)} /><Chip small label="Move" onPress={() => { setSwap(null); setMoving(moving === i.id ? null : i.id); }} />
                    </View>
                    {moving === i.id && (
                      <View>
                        <Text style={[S.muted, { marginBottom: 2 }]}>Move to another meal</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{MEALS.filter(([m]) => m !== id).map(([m, l]) => <Chip key={m} small label={l} onPress={() => { setMoving(null); run(() => write('PATCH', `/api/meal-plans/${i.id}`, { mealType: m }, `Move ${i.foodName}`)); }} />)}</View>
                        <Text style={[S.muted, { marginBottom: 2 }]}>…or another day</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{days.filter((d) => d !== day && d >= today()).map((d) => <Chip key={d} small label={short(d)} onPress={() => { setMoving(null); run(() => write('PATCH', `/api/meal-plans/${i.id}`, { date: d, today: today() }, `Move ${i.foodName}`)); }} />)}</View>
                      </View>
                    )}
                    {swap?.id === i.id && (
                      <View style={{ marginBottom: 6 }}>
                        <Text style={[S.muted, { marginBottom: 2 }]}>Swap for something similar</Text>
                        {!swap.alts && <Text style={S.muted}>Finding options…</Text>}
                        {swap.alts?.length === 0 && <Text style={S.muted}>No similar foods found.</Text>}
                        {swap.alts?.map((a) => (
                          <TouchableOpacity key={a.foodId || a.name} accessibilityRole="button" onPress={() => doSwap(i, a)} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                            <Text style={{ color: colors.ink, fontWeight: '700' }}>{a.name}{a.familiar ? '  ★' : ''}</Text>
                            <Text style={S.muted}>{a.quantity} {a.unit} · {a.calories} kcal · {a.protein} g protein</Text>
                            {!!a.reason && <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>{a.reason}</Text>}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
                addPanel={adding === key ? <FoodSearch actionLabel="Add to plan" onCancel={() => setAdding(null)} onPick={async (f, qty) => { const r = await run(() => post('/api/meal-plans', { date: day, mealType: id, foodId: f._id, quantity: qty, today: today(), clientId: newClientId('pa') })); if (r) setAdding(null); }} /> : null} />
            );
          })}
        </View>
      )}
    </Screen>
  );
}
