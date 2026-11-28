import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BuddyEmpty } from '../motion/Buddy';
import { tourRef } from '../tour/anchors';
import { Modal, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { today } from '../config/api';
import { QuickAddSheet } from '../components/QuickAddSheet';
import { SwipeRow } from '../components/SwipeRow';
import { PortionEdit } from '../components/PortionEdit';
import { Suggestions } from '../components/Suggestions';
import { getSkippedMeals, markMealSkipped, refreshMealNudges, unskipMeal } from '../utils/notifications';
import { FitPreview } from '../components/FitPreview';
import { FoodTrust } from '../components/FoodTrust';
import { RepeatPreview } from '../components/RepeatPreview';
import { PortionGuide } from '../components/PortionGuide';
import { ChaiCounter } from '../components/ChaiCounter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CookIdeas } from '../components/CookIdeas';
import { TiffinPlanner } from '../components/TiffinPlanner';
import { GlycemicTag, PairingTip } from '../components/Glycemic';
import { write, useOffline, read } from '../utils/offline';
import { attemptId, attemptDone } from '../utils/attemptId';
import { Button, Field, Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { IntakeBanner } from '../components/IntakeBanner';
import { EntryCheck } from '../components/EntryCheck';
import { useCoachTone } from '../utils/coachTone';
import { useNotifications } from '../components/Notifications';
import { successHaptic } from '../utils/haptics';
import { useProfile } from '../hooks/useProfile';
import { useSteps } from '../hooks/useSteps';
import { dayBalance, stepCalories } from '../utils/energy';
import { SafeIntakeCard } from '../components/SafeIntakeCard';
import { CalorieBalance } from '../components/CalorieBalance';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { MacroCard } from '../components/DailyExtras';
import { FoodMismatchNote } from '../components/FoodMismatchNote';
import { TodayFoodList } from '../components/food/TodayFoodList';
import { correctQuick } from '../utils/quickCorrect';
import { applyQuickCorrection } from '../utils/optimistic';
import { MyFoodsTab } from '../components/food/MyFoodsTab';
import { FoodEditorModal } from '../components/food/FoodEditorModal';
import { useEventRoom } from '../hooks/useEventRoom';
import { addDays } from '../utils/dates';

import { meals, MEAL_LABEL, MEAL_ICON, MEAL_NAME, MEAL_COLOR, num, MICRO_FIELDS, type MicroKey, blankMicro, type Food, emptyDraft } from '../components/food/foodHelpers';

export default function Food() {
  const { error, warning, success, undoableDelete } = useNotifications();
  const { S, colors } = useThemedStyles();
  const { syncVersion } = useOffline();
  const { profile } = useProfile();
  const stepper = useSteps();
  const [workoutKcal, setWorkoutKcal] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [savedMeals, setSavedMeals] = useState<any[]>([]);
  const [saveFor, setSaveFor] = useState<string | null>(null); // meal slot being saved as a reusable meal
  const [saveName, setSaveName] = useState('');
  const [tab, setTab] = useState<'log' | 'manage'>('log');
  const [f, setF] = useState<Food[]>([]);
  const [recent, setRecent] = useState<Food[]>([]);
  const [l, setL] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Food | undefined>();
  const [servings, setServings] = useState('1');   // how many servings
  const [size, setSize] = useState('');             // size of one serving, in the food's unit
  const [meal, setMeal] = useState('breakfast');
  const [skipped, setSkipped] = useState<string[]>([]); // meals marked "Skipped it" today (from a reminder or here)
  const [refreshing, setRefreshing] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const params = useLocalSearchParams<{ suggest?: string; meal?: string }>();
  // Opened from Home's "Fix my day": jump to the right meal with suggestions already showing.
  useEffect(() => { if (params.meal && ['breakfast', 'lunch', 'dinner', 'snacks'].includes(String(params.meal))) setMeal(String(params.meal)); if (params.suggest) setShowSuggest(true); }, [params.meal, params.suggest]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [editor, setEditor] = useState<any | null>(null); // draft while adding/editing a custom food
  const [editorId, setEditorId] = useState<string | null>(null); // null = creating new
  const [editorFromLog, setEditorFromLog] = useState(false); // opened from the Log tab -> return there & select the new food

  // Typing in the search box must only re-run the (debounced) food search — not today's log, recents, activity and saved meals as well.
  const foodSeq = useRef(0);
  const loadFoods = useCallback(async () => {
    const id = ++foodSeq.current;
    try {
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      if (favOnly) params.set('favorites', 'true');
      if (mineOnly) params.set('mine', 'true');
      params.set('limit', favOnly || mineOnly ? '300' : '60'); // only ~40 are shown; don't download the whole catalogue each time
      const a = await read<any>(`/api/foods?${params.toString()}`);
      if (id === foodSeq.current) setF(a.foods || []); // ignore answers that arrive after a newer search
    } catch (e: any) { error('Something went wrong', e.message); }
  }, [error, q, favOnly, mineOnly]);

  const loadRest = useCallback(async () => {
    try {
      const [b, c, act] = await Promise.all([
        read<any>(`/api/food-logs?date=${today()}`),
        read<any>('/api/foods/recent'),
        read<any>(`/api/activities/summary?date=${today()}`).catch(() => null),
      ]);
      const sm = act?.summary || {};
      setWorkoutKcal(Number(sm.workoutCalories ?? Math.max(0, Number(sm.caloriesBurned || 0) - Number(sm.stepCalories || 0))));
      read<any>('/api/saved-meals').then((r) => setSavedMeals(r.meals || [])).catch(() => {});
      setL(b.logs || []);
      setRecent(c.foods || []);
      refreshMealNudges((b.logs || []).map((x: any) => String(x.mealType))); // today's "not logged yet" nudge goes away once that meal has an entry
    } catch (e: any) { error('Something went wrong', e.message); } finally { setRefreshing(false); }
  }, [error]);

  const load = useCallback(async () => { await Promise.all([loadFoods(), loadRest()]); }, [loadFoods, loadRest]);
  const firstSearch = useRef(true);
  useEffect(() => {
    const t = setTimeout(loadFoods, firstSearch.current ? 0 : 250);
    firstSearch.current = false;
    return () => clearTimeout(t);
  }, [loadFoods]);
  useEffect(() => { loadRest(); }, [loadRest]);
  useEffect(() => { if (syncVersion > 0) load(); }, [syncVersion]);

  const [diabetesView, setDiabetesViewState] = useState(false);
  useEffect(() => { AsyncStorage.getItem('ff-diabetes-view').then((v) => setDiabetesViewState(v === '1')).catch(() => {}); }, []);
  const setDiabetesView = (v: boolean) => { setDiabetesViewState(v); AsyncStorage.setItem('ff-diabetes-view', v ? '1' : '0').catch(() => {}); };
  // Diabetes-friendly view (this device only): LOW glycemic load first, HIGH last, foods without a published value in between.
  const glRank = (x: any) => { const g = x?.glycemic; if (!g?.known) return 2; const b = g.glBand || g.giBand; return b === 'low' ? 0 : b === 'medium' ? 1 : 3; };
  const filtered = useMemo(() => (diabetesView ? [...f].sort((a: any, b: any) => glRank(a) - glRank(b)) : f).slice(0, 40), [f, diabetesView]);
  useEffect(() => { getSkippedMeals().then(setSkipped).catch(() => {}); }, [meal, l]);
  const mealKcal = (m: string) => l.filter((x) => x.mealType === m).reduce((t, x) => t + Number(x.nutritionTotal?.calories || 0), 0);
  const eventRoom = useEventRoom();
  const balToday = dayBalance(profile, { eaten: 0, workout: 0, steps: 0, extra: eventRoom }); // target only; the card gets eaten/budget below
  const eatenToday = l.reduce((t, x) => t + Number(x.nutritionTotal?.calories || 0), 0);

  // Choose a food: default to exactly 1 serving of its standard size.
  // Start from what you usually eat (the typical amount you've logged for this food), rounded to the nearest half serving.
  const pick = (x: Food) => {
    const usual = Number((x as any).usualQuantity) || 0;
    const per = Number(x.servingSize) || 1;
    const guess = usual > 0 ? Math.min(6, Math.max(0.5, Math.round((usual / per) * 2) / 2)) : 1;
    setSel(x); setQ(x.name); setServings(String(guess)); setSize(String(x.servingSize));
  };
  const quantity = (num(servings) || 0) * (num(size) || 0); // total amount eaten, in the food's unit
  const ratio = sel ? quantity / (sel.servingSize || 1) : 0;  // how many "standard servings" that is

  const add = async () => {
    if (!sel || !(num(servings) > 0) || !(num(size) > 0)) return warning('Missing food details', 'Select a food, then enter the number of servings and the serving size.');
    try {
      const r = await write('POST', '/api/food-logs', { foodId: sel._id, date: today(), mealType: meal, quantity, clientId: `fl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, `${sel.name}`, {
        // What this entry will look like once synced — lets Home, History and Progress include it right away while offline.
        foodName: sel.name, consumedQuantity: quantity, servingUnit: sel.servingUnit, servings: ratio,
        nutritionTotal: { calories: sel.calories * ratio, protein: (sel.protein || 0) * ratio, carbohydrates: (sel.carbohydrates || 0) * ratio, fat: (sel.fat || 0) * ratio, fiber: (sel.fiber || 0) * ratio, sugar: (sel.sugar || 0) * ratio },
      });
      successHaptic();
      setSel(undefined); setServings('1'); setSize(''); setQ('');
      success(r.queued ? 'Saved offline' : 'Saved', r.queued ? 'Will sync once you\u2019re back online.' : 'Food logged.');
      load();
    } catch (e: any) { error('Something went wrong', e.message); }
  };

  const [movingId, setMovingId] = useState<string | null>(null);
  const [tagId, setTagId] = useState<string | null>(null);
  const TAGS: [string, string][] = [['stress', '😣 Stress'], ['social', '👥 Social'], ['bored', '😐 Bored'], ['late-night', '🌙 Late night'], ['hungry', '😋 Really hungry'], ['celebration', '🎉 Celebrating']];
  const setTag = async (id: string, trigger: string) => {
    setL((cur) => cur.map((x) => (x._id === id ? { ...x, trigger } : x)));
    try { await write('PATCH', `/api/food-logs/${id}`, { trigger }, 'Tag entry'); } catch (e: any) { error('Could not tag it', e.message); load(); }
  };
  const [quickOpen, setQuickOpen] = useState(false);
  const moveLog = async (id: string, to: string) => {
    setMovingId(null);
    const before = l;
    setL((cur) => cur.map((x) => (x._id === id ? { ...x, mealType: to } : x))); // instant: show it in the new meal right away
    try {
      const r = await write('PATCH', `/api/food-logs/${id}`, { mealType: to }, `Move to ${to}`);
      success('Moved', r.queued ? `Will move to ${MEAL_LABEL[to] || to} when you're online.` : `Moved to ${MEAL_LABEL[to] || to}.`);
      loadRest();
    } catch (e: any) { setL(before); error('Could not move', e.message); } // put it back if the server said no
  };

  // Move an entry to another day (forgot to log it, logged it on the wrong day): it leaves today's list at once, and comes back if the server says no.
  const moveLogDay = async (id: string, date: string) => {
    setMovingId(null);
    const before = l;
    setL((cur) => cur.filter((x) => x._id !== id));
    try {
      const r = await write('PATCH', `/api/food-logs/${id}`, { date }, `Move to ${date}`);
      success('Moved', r.queued ? `Will move to ${date} when you're online.` : `Moved to ${date}.`);
      loadRest();
    } catch (e: any) { setL(before); error('Could not move', e.message); }
  };

  // Swipe-left delete: remove instantly, with a 5 s Undo toast.
  const swipeDelete = (x: any) => {
    const before = l;
    setL((cur) => cur.filter((y) => y._id !== x._id));
    undoableDelete(`${x.foodName} removed`, async () => {
      try { await write('DELETE', `/api/food-logs/${x._id}`, undefined, 'Delete food log'); loadRest(); }
      catch (e: any) { setL(before); error('Delete failed', e.message); }
    }, () => setL(before));
  };

  // Change the amount of a logged food; the server recalculates nutrition from the stored snapshot.
  const [editQtyId, setEditQtyId] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const saveQty = async (x: any, quantity: number) => {
    setEditBusy(true);
    try {
      await write('PATCH', `/api/food-logs/${x._id}`, { quantity }, `Change ${x.foodName}`);
      const ratio = Number(x.consumedQuantity) > 0 ? quantity / Number(x.consumedQuantity) : 1;
      setL((cur) => cur.map((y) => (y._id === x._id ? { ...y, consumedQuantity: quantity, nutritionTotal: Object.fromEntries(Object.entries(y.nutritionTotal || {}).map(([k, v]) => [k, typeof v === 'number' ? v * ratio : v])) } : y)));
      setEditQtyId(null);
      const before = Number(x.consumedQuantity);
      // already saved: Undo (5 s) puts the old amount back
      undoableDelete(`${x.foodName} is now ${quantity} ${x.servingUnit}`, () => {}, async () => {
        try { await write('PATCH', `/api/food-logs/${x._id}`, { quantity: before }, `Change ${x.foodName}`); } catch { /* shown on reload */ }
        await load();
      });
      loadRest();
    } catch (e: any) { error('Could not change the amount', e.message); } finally { setEditBusy(false); }
  };

  // Correct a quick-add estimate (name and numbers). `body` is only what changed (utils/quickEdit); the day and how much each total moves go along as `meta`
  // so the offline cache can show the correction at once on this list, on Home and in History. Undo (5 s) sends the old values back.
  const saveQuick = async (x: any, body: any) => {
    setEditBusy(true);
    try {
      await correctQuick(x, body, {
        write,
        showSaved: (patch) => { setL((cur) => cur.map((y) => (y._id === x._id ? applyQuickCorrection(y, patch) : y))); setEditQtyId(null); },
        offerUndo: (message, undo) => undoableDelete(message, () => {}, undo),   // already saved: Undo (5 s) puts the old values back
        reload: load,
      });
      loadRest();
    } catch (e: any) { error('Could not correct the estimate', e.message); } finally { setEditBusy(false); }
  };

  const removeLog = async (id: string) => {
    const before = l;
    setL((cur) => cur.filter((y) => y._id !== id));
    undoableDelete('Food entry removed', async () => {
      try { await write('DELETE', `/api/food-logs/${id}`, undefined, 'Delete food log'); load(); }
      catch (e: any) { setL(before); error('Delete failed', e.message); }
    }, () => setL(before));
  };

  const toggleFavorite = async (food: Food) => {
    setF((prev) => prev.map((x) => (x._id === food._id ? { ...x, isFavorite: !x.isFavorite } : x)));
    try { await write('PATCH', `/api/foods/${food._id}/favorite`, {}, 'Favourite food'); } catch { load(); }
  };

  const duplicate = async (food: Food) => {
    try {
      await write('POST', `/api/foods/${food._id}/duplicate`, {}, 'Duplicate food');
      success('Copied', `"${food.name}" was added to your foods — edit it freely.`);
      load();
    } catch (e: any) { error('Could not copy', e.message); }
  };

  // ---- copy yesterday / saved meals / barcode ----
  // Copy yesterday / same as last time: a preview (quantities editable) before anything is saved.
  const [repeat, setRepeat] = useState<'yesterday' | 'last' | null>(null);
  const [chaiOpen, setChaiOpen] = useState(false);
  const gentleMode = useCoachTone().gentle;
  const [cookOpen, setCookOpen] = useState(false);
  const [tiffinOpen, setTiffinOpen] = useState(false);

  // Multi-select: tick several foods, edit amounts, add them all in one tap.
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<Record<string, { food: Food; quantity: string }>>({});
  const togglePick = (f: Food) => setPicked((p) => { if (p[f._id]) { const { [f._id]: _d, ...rest } = p; return rest; } return { ...p, [f._id]: { food: f, quantity: String(f.servingSize || 1) } }; });
  // One "add" at a time: a second tap while the first is still going is ignored (the ref is set at once; state would be too late).
  const adding = useRef(false);
  const [addingUi, setAddingUi] = useState(false);
  const addPicked = async () => {
    const items = Object.values(picked).map((x) => ({ foodId: x.food._id, quantity: num(x.quantity) || x.food.servingSize || 1 }));
    if (!items.length || adding.current) return;
    adding.current = true; setAddingUi(true);
    // The same selection retried (a second tap, a retry after a timeout) keeps the same id, so the server adds it once.
    const same = { date: today(), meal, items };
    try {
      const r = await write('POST', '/api/food-logs/bulk', { date: same.date, mealType: meal, items, clientId: attemptId('multi', same) }, `${items.length} foods`);
      attemptDone('multi', same);
      successHaptic();
      success(r.queued ? 'Queued' : 'Added', r.queued ? `${items.length} foods will be added when you're online.` : `${items.length} food${items.length === 1 ? '' : 's'} added to ${MEAL_NAME[meal].toLowerCase()}.`);
      setPicked({}); setMulti(false); load();
    } catch (e: any) { error('Could not add those', e.message); }
    finally { adding.current = false; setAddingUi(false); }
  };

  const loggingMeal = useRef(false);
  const logSavedMeal = async (sm: any) => {
    if (loggingMeal.current) return;
    loggingMeal.current = true;
    const same = { id: sm._id, date: today(), meal };
    try {
      const r = await write('POST', `/api/saved-meals/${sm._id}/log`, { date: same.date, mealType: meal, clientId: attemptId('sm', same) }, `Meal: ${sm.name}`);
      attemptDone('sm', same);
      successHaptic();
      success('Added', r.queued ? `"${sm.name}" will be added to ${meal} when you're online.` : `"${sm.name}" added to ${meal}.`);
      load();
    } catch (e: any) { error('Could not add meal', e.message); }
    finally { loggingMeal.current = false; }
  };

  const saveAsMeal = async () => {
    const items = l.filter((x) => x.mealType === saveFor).map((x) => ({ foodId: x.foodId, quantity: x.consumedQuantity }));
    if (!saveName.trim()) return warning('Name needed', 'Give this meal a name, e.g. "My usual breakfast".');
    if (!items.length) return;
    try {
      await write('POST', '/api/saved-meals', { name: saveName.trim(), items }, `Save meal: ${saveName.trim()}`);
      success('Saved', `"${saveName.trim()}" is now one tap away under Saved meals.`);
      setSaveFor(null); setSaveName(''); load();
    } catch (e: any) { error('Could not save', e.message); }
  };

  const deleteSavedMeal = async (sm: any) => {
    const before = savedMeals;
    setSavedMeals((cur) => cur.filter((y) => y._id !== sm._id));
    undoableDelete(`"${sm.name}" removed`, async () => {
      try { await write('DELETE', `/api/saved-meals/${sm._id}`, undefined, 'Delete saved meal'); load(); } catch (e: any) { setSavedMeals(before); error('Delete failed', e.message); }
    }, () => setSavedMeals(before));
  };

  const onBarcode = async (code: string) => {
    setScanning(false);
    try {
      const r = await read<any>(`/api/foods/barcode/${code}`);
      if (!r.found) { warning('Not found', 'That product is not in the database yet — add it manually and it will be remembered.'); return openNew('', true); }
      if (r.saved) { setTab('log'); pick(r.food); return; }
      const d = r.food;
      setEditor({ ...emptyDraft, name: (d.missing || []).includes('name') ? '' : d.name, brand: d.brand || '', servingSize: String(d.servingSize), servingUnit: d.servingUnit, calories: (d.missing || []).includes('calories') ? '' : String(d.calories), protein: (d.missing || []).includes('protein') ? '' : String(d.protein), carbohydrates: (d.missing || []).includes('carbohydrates') ? '' : String(d.carbohydrates), fat: (d.missing || []).includes('fat') ? '' : String(d.fat), fiber: String(d.fiber), sugar: String(d.sugar), sodium: String(d.sodium || 0), barcode: d.barcode, notes: 'From Open Food Facts — check against the pack.' });
      setEditorId(null); setEditorFromLog(true);
      const gaps: string[] = d.missing || [], guess: string[] = d.estimated || [];
      const labelOf: Record<string, string> = { calories: 'calories', protein: 'protein', carbohydrates: 'carbs', fat: 'fat', name: 'the product name' };
      if (gaps.length) warning('Some details are missing', `This product has no data for ${gaps.map((g) => labelOf[g] || g).join(', ')}. Check the pack and fill them in, then save and it is remembered.`);
      else if (guess.includes('calories')) success('Product found', 'Calories were estimated from protein, carbs and fat. Check them against the pack.');
      else success('Product found', 'Check the numbers, then save to log it.');
    } catch (e: any) { error('Lookup failed', e.message); }
  };

  // ---- custom food editor (create/edit) ----
  const openNew = (name = '', fromLog = false) => { setEditor({ ...emptyDraft, name }); setEditorId(null); setEditorFromLog(fromLog); };
  const openEdit = (food: Food) => {
    setEditor({
      name: food.name, brand: food.brand || '', servingSize: String(food.servingSize), servingUnit: food.servingUnit,
      calories: String(food.calories), protein: String(food.protein || 0), carbohydrates: String(food.carbohydrates || 0),
      fat: String(food.fat || 0), fiber: String(food.fiber || 0), sugar: String(food.sugar || 0), notes: food.notes || '',
      sodium: String(food.sodium || 0), barcode: food.barcode || '', units: food.units || [],
      ...(Object.fromEntries(MICRO_FIELDS.map(([k]) => [k, food[k] == null ? '' : String(food[k])])) as Record<MicroKey, string>),
    });
    setEditorId(food._id);
    setEditorFromLog(false);
  };

  const saveEditor = async () => {
    if (!editor.name.trim()) return warning('Missing name', 'Give the food a name.');
    const servingSize = Number(editor.servingSize);
    const calories = Number(editor.calories);
    if (!(servingSize > 0)) return warning('Invalid serving size', 'Serving size must be greater than 0.');
    if (!(calories >= 0)) return warning('Invalid calories', 'Enter calories per serving.');
    const body = {
      name: editor.name.trim(), brand: editor.brand.trim(), servingSize, servingUnit: editor.servingUnit.trim() || 'g',
      calories, protein: Number(editor.protein) || 0, carbohydrates: Number(editor.carbohydrates) || 0,
      fat: Number(editor.fat) || 0, fiber: Number(editor.fiber) || 0, sugar: Number(editor.sugar) || 0, notes: editor.notes.trim(),
      sodium: Number(editor.sodium) || 0, barcode: editor.barcode || '', units: editor.units || [],
      // blank = unknown, never saved as 0
      ...Object.fromEntries(MICRO_FIELDS.map(([k]) => [k, String(editor[k]).trim() === '' ? null : num(editor[k])])),
    };
    try {
      let created: Food | undefined; let already = false;
      if (editorId) await write('PUT', `/api/foods/${editorId}`, body, `Food: ${body.name}`);
      else { const r = await write('POST', '/api/foods', body, `Food: ${body.name}`); created = r.data?.food; already = !!r.data?.duplicate; }
      success('Saved', editorId ? 'Food updated.' : already ? 'You already have this exact food, so it was not saved twice.' : 'Custom food added.');
      setEditor(null);
      if (editorFromLog && created) {
        // Straight back to logging with the new food selected.
        setTab('log'); pick(created);
      }
      load();
    } catch (e: any) { error('Save failed', e.message); }
  };

  const deleteCustom = async (food: Food) => {
    const before = f;
    setF((cur) => cur.filter((x) => x._id !== food._id));
    undoableDelete(`"${food.name}" removed`, async () => {
      try { await write('DELETE', `/api/foods/${food._id}`, undefined, 'Delete food'); load(); }
      catch (e: any) { setF(before); error('Delete failed', e.message); }
    }, () => setF(before));
  };

  return (
    <Screen buddyWho="luffy" buddy="eat" buddySays="What's on the plate?" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Log food</Text>
      {!gentleMode && <IntakeBanner />}
      {!gentleMode && <EntryCheck refreshKey={`${l.length}|${l.reduce((t: number, x: any) => t + Number(x.nutritionTotal?.calories || 0), 0)}`} />}

      <View style={{ flexDirection: 'row', marginBottom: 16 }}>
        <Chip label="Log food" active={tab === 'log'} onPress={() => setTab('log')} />
        <Chip label="My foods" active={tab === 'manage'} onPress={() => setTab('manage')} />
      </View>

      {tab === 'log' ? (
        <>
          {/* 1. Where am I today? One compact card (tap to expand the maths). */}
          <CalorieBalance collapsible profile={profile} eaten={eatenToday} workout={workoutKcal} extra={eventRoom} stepKcal={stepCalories(stepper.steps, profile?.currentWeightKg)} />
          <SafeIntakeCard eaten={eatenToday} budget={dayBalance(profile, { eaten: eatenToday, workout: workoutKcal, steps: stepCalories(stepper.steps, profile?.currentWeightKg), extra: eventRoom }).budget} target={balToday.target} sex={(profile as any)?.sex} />

          {/* 2. Which meal? Chosen once, here — everything below logs to it. */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.chipBg, borderRadius: 18, padding: 4, marginBottom: 12, gap: 4 }}>
            {meals.map((m) => {
              const active = meal === m;
              const kc = mealKcal(m);
              return (
                <TouchableOpacity key={m} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${MEAL_NAME[m]}${kc ? `, ${Math.round(kc)} kcal logged` : ''}`}
                  onPress={() => { setMeal(m); setSel(undefined); }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 14, backgroundColor: active ? colors.primary : 'transparent' }}>
                  <Text style={{ fontSize: 17 }}>{MEAL_ICON[m]}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#fff' : colors.ink, marginTop: 1 }}>{MEAL_NAME[m]}</Text>
                  <Text style={{ fontSize: 12, color: active ? '#E8E3FF' : colors.muted }}>{kc ? `${Math.round(kc)} kcal` : skipped.includes(m) ? 'skipped' : '—'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {skipped.includes(meal) && mealKcal(meal) === 0 && (
            <View style={[S.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }]}>
              <Text style={{ flex: 1, color: colors.ink, fontWeight: '700' }}>{MEAL_NAME[meal]} skipped today. No reminders for it.</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Undo skipping ${meal}`} onPress={async () => { await unskipMeal(meal); setSkipped(await getSkippedMeals()); }} style={{ padding: 8 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Undo</Text></TouchableOpacity>
            </View>
          )}
          {!skipped.includes(meal) && mealKcal(meal) === 0 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`I skipped ${meal} today`} onPress={async () => { await markMealSkipped(meal); setSkipped(await getSkippedMeals()); }} style={{ alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 8 }}><Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12.5 }}>Skipped {MEAL_NAME[meal].toLowerCase()} today?</Text></TouchableOpacity>
          )}

          {/* 3. Add food: one search box + the shortcuts people actually use. */}
          <View style={S.card}>
            <View style={[S.between, { marginBottom: 8 }]}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>Add to {MEAL_NAME[meal].toLowerCase()}</Text>
              <TouchableOpacity onPress={() => openNew(q, true)} accessibilityRole="button" accessibilityLabel="Add a new food"><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>＋ New food</Text></TouchableOpacity>
            </View>
            <TextInput ref={tourRef('food-search')} testID="tour-food-search" accessibilityLabel="Search foods" style={S.input} value={q} onChangeText={(v) => { setQ(v); setSel(undefined); setShowAll(false); }} placeholder="Search: idli, chicken biryani, dal…" placeholderTextColor={colors.muted} returnKeyType="search"
              onFocus={() => setSearchFocus(true)} onBlur={() => setTimeout(() => setSearchFocus(false), 250)} />
            {!sel && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} keyboardShouldPersistTaps="handled">
                <Chip small label="＋ Type a meal" onPress={() => setQuickOpen(true)} />
                <Chip small label="📷 Scan" onPress={() => setScanning(true)} />
                <Chip small label="⟲ Copy yesterday's" onPress={() => setRepeat('yesterday')} />
                <Chip small label="⟲ Same as last time" onPress={() => setRepeat('last')} />
                <Chip small label={multi ? '✕ Stop selecting' : '☑ Select several'} active={multi} onPress={() => { setMulti(!multi); setPicked({}); }} />
                <Chip small label="🍵 Chai counter" active={chaiOpen} onPress={() => setChaiOpen(!chaiOpen)} />
                <Chip small label="🍳 What can I cook?" active={cookOpen} onPress={() => setCookOpen(!cookOpen)} />
                <Chip small label="🍱 Tomorrow's lunch" active={tiffinOpen} onPress={() => setTiffinOpen(!tiffinOpen)} />
                <Chip small label="🩸 Diabetes-friendly view" active={diabetesView} onPress={() => setDiabetesView(!diabetesView)} />
                <Chip small label="🍴 Eating out" onPress={() => setQuickOpen(true)} />
                <Chip small label="📅 Planner" onPress={() => router.push('/plan' as any)} />
                <Chip small label="🍲 Recipes" onPress={() => router.push('/recipes' as any)} />
              </ScrollView>
            )}
            {repeat && <RepeatPreview date={today()} meal={meal} mode={repeat} onClose={() => setRepeat(null)} onDone={() => { setRepeat(null); load(); }} />}
            {chaiOpen && <ChaiCounter onLogged={load} />}
            {cookOpen && <CookIdeas meal={meal} onLogged={load} />}
            {tiffinOpen && <TiffinPlanner />}
            {diabetesView && <Text style={[S.muted, { marginBottom: 8 }]}>Low glycemic-load foods are listed first. This is general information from published tables, not medical advice. Follow your doctor's guidance.</Text>}
            <QuickAddSheet visible={quickOpen} onClose={() => setQuickOpen(false)} meal={meal} setMeal={setMeal} recent={recent} onLogged={load} />

            {/* Recent + saved meals only while the search box is empty, so results are never pushed off-screen. */}
            {searchFocus && !q && !sel && !!recent.length && (
              <View style={{ marginBottom: 6 }}>
                <Text style={S.label}>Recent — tap to pick</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {recent.map((x) => (
                    <TouchableOpacity key={x._id} onPress={() => pick(x)} style={{ backgroundColor: colors.chipBg, borderRadius: 14, padding: 11, marginRight: 8, width: 132 }}>
                      <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 12 }} numberOfLines={2}>{x.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>{Math.round(x.calories)} kcal · {x.servingSize}{x.servingUnit}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {searchFocus && !q && !sel && !!savedMeals.length && (
              <View style={{ marginBottom: 4 }}>
                <Text style={S.label}>Saved meals → {meal} (long-press to delete)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {savedMeals.map((sm) => (
                    <TouchableOpacity key={sm._id} onPress={() => logSavedMeal(sm)} onLongPress={() => deleteSavedMeal(sm)} style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 11, marginRight: 8, width: 132 }}>
                      <Text style={{ fontWeight: '700', color: colors.primary, fontSize: 12 }} numberOfLines={2}>{sm.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>{sm.items.length} item{sm.items.length === 1 ? '' : 's'} · {Math.round(sm.items.reduce((t: number, i: any) => t + (i.calories || 0), 0))} kcal</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Search results: best 8 first; "show all" for more. */}
            {!!q && !sel && (showAll ? filtered : filtered.slice(0, 8)).map((x) => (
              <TouchableOpacity key={x._id} style={[S.item, { paddingVertical: 10 }, picked[x._id] ? { borderLeftWidth: 3, borderLeftColor: colors.primary } : null]} onPress={() => (multi ? togglePick(x) : pick(x))} accessibilityRole={multi ? 'checkbox' : 'button'} accessibilityState={multi ? { checked: !!picked[x._id] } : undefined} accessibilityLabel={`${x.name}, ${Math.round(x.calories)} kilocalories per ${x.servingSize} ${x.servingUnit}`}>
                <View style={S.between}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontWeight: '700', color: colors.ink }} numberOfLines={2}>{multi ? (picked[x._id] ? '☑ ' : '☐ ') : ''}{x.isFavorite ? '⭐ ' : ''}{x.name}{x.isCustom ? ' · mine' : ''}</Text>
                    <GlycemicTag food={x} />
                    <Text style={S.muted}>{x.servingSize}{x.servingUnit} · P {Math.round(x.protein || 0)}g · C {Math.round(x.carbohydrates || 0)}g · F {Math.round(x.fat || 0)}g</Text>
                  </View>
                  <Text style={{ fontWeight: '800', color: colors.primary }}>{Math.round(x.calories)} <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>kcal</Text></Text>
                </View>
              </TouchableOpacity>
            ))}
            {multi && Object.keys(picked).length > 0 && (
              <View style={{ marginTop: 8 }}>
                {Object.values(picked).map(({ food, quantity: qv }) => (
                  <View key={food._id} style={[S.row, { marginBottom: 6 }]}>
                    <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }} numberOfLines={2}>{food.name}</Text>
                    <TextInput accessibilityLabel={`Amount of ${food.name}`} style={[S.input, { width: 76, marginBottom: 0, minHeight: 44, paddingVertical: 8 }]} keyboardType="decimal-pad" value={qv} onChangeText={(v) => setPicked({ ...picked, [food._id]: { food, quantity: v } })} />
                    <Text style={{ width: 34, marginLeft: 6, color: colors.muted }}>{food.servingUnit}</Text>
                  </View>
                ))}
                <Button title={addingUi ? 'Adding…' : `Add ${Object.keys(picked).length} to ${MEAL_NAME[meal].toLowerCase()}`} onPress={addPicked} disabled={addingUi} />
              </View>
            )}
            {!!q && !sel && !showAll && filtered.length > 8 && (
              <TouchableOpacity onPress={() => setShowAll(true)} style={{ paddingVertical: 10 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Show all {filtered.length} matches ›</Text></TouchableOpacity>
            )}
            {!!q && !sel && filtered.length === 0 && (
              <TouchableOpacity onPress={() => openNew(q, true)} style={{ padding: 12 }}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>No results — add “{q}” as your own food →</Text>
              </TouchableOpacity>
            )}

            {sel && <>
              <View style={[S.between, { marginBottom: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 15 }}>{sel.name}</Text>
                  <Text style={S.muted}>Standard serving {sel.servingSize}{sel.servingUnit} · {Math.round(sel.calories)} kcal</Text>
                  <FoodTrust food={sel} />
                  <GlycemicTag food={sel} />
                </View>
                <TouchableOpacity onPress={() => { setSel(undefined); setQ(''); }} hitSlop={10} accessibilityLabel="Choose a different food"><Text style={{ color: colors.muted, fontSize: 20, fontWeight: '700' }}>✕</Text></TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
                {[0.5, 1, 1.5, 2, 3].map((n) => <Chip key={n} label={`${n}×`} small active={num(servings) === n} onPress={() => setServings(String(n))} />)}
              </View>
              {!!sel.units?.length && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {sel.units.map((u) => <Chip key={u.label} small label={`1 ${u.label} = ${u.quantity}${sel.servingUnit}`} active={num(size) === u.quantity} onPress={() => setSize(String(u.quantity))} />)}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="Servings" value={servings} onChangeText={setServings} keyboardType="decimal-pad" placeholder="1" /></View>
                <View style={{ flex: 1 }}><Field label={`One serving (${sel.servingUnit})`} value={size} onChangeText={setSize} keyboardType="decimal-pad" /></View>
              </View>
              <PortionGuide />
              <PairingTip food={sel} />
              <View style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginBottom: 12 }}>
                <Text style={{ fontWeight: '800', color: colors.primary }}>{Math.round(sel.calories * ratio)} kcal · {Math.round(quantity * 10) / 10}{sel.servingUnit} total</Text>
                <Text style={S.muted}>P {(sel.protein * ratio).toFixed(1)}g · C {(sel.carbohydrates * ratio).toFixed(1)}g · F {(sel.fat * ratio).toFixed(1)}g</Text>
              </View>
              {sel && ratio > 0 && !gentleMode && <FitPreview foodId={sel._id} quantity={quantity} />}
              <Button title={`Add to ${MEAL_NAME[meal].toLowerCase()}`} onPress={add} />
            </>}
          </View>

          {/* 4. What I've logged — right under the add box, selected meal open, the others one tap away. */}
          <TodayFoodList TAGS={TAGS} eatenToday={eatenToday} editBusy={editBusy} editQtyId={editQtyId} expanded={expanded} l={l} mealKcal={mealKcal} moveLog={moveLog} moveLogDay={moveLogDay} movingId={movingId} removeLog={removeLog} saveAsMeal={saveAsMeal} saveFor={saveFor} saveName={saveName} saveQty={saveQty} saveQuick={saveQuick} setEditQtyId={setEditQtyId} setExpanded={setExpanded} setMovingId={setMovingId} setSaveFor={setSaveFor} setSaveName={setSaveName} setTag={setTag} setTagId={setTagId} swipeDelete={swipeDelete} tagId={tagId} meal={meal} />

          {/* 5. Extras, out of the way. */}
          <TouchableOpacity onPress={() => setShowSuggest((v) => !v)} accessibilityRole="button" style={[S.between, { paddingVertical: 12 }]}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>💡 Suggestions for you</Text>
            <Text style={{ color: colors.muted, fontSize: 18 }}>{showSuggest ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          {showSuggest && <Suggestions meal={meal} refreshKey={l.length} onLogged={load} />}
          <FoodMismatchNote logs={l} />
          <MacroCard profile={profile as any} budget={dayBalance(profile, { eaten: eatenToday, workout: workoutKcal, steps: stepCalories(stepper.steps, profile?.currentWeightKg), extra: eventRoom }).budget} eaten={{ protein: l.reduce((t, x) => t + Number(x.nutritionTotal?.protein || 0), 0), carbohydrates: l.reduce((t, x) => t + Number(x.nutritionTotal?.carbohydrates || 0), 0), fat: l.reduce((t, x) => t + Number(x.nutritionTotal?.fat || 0), 0), fiber: l.reduce((t, x) => t + Number(x.nutritionTotal?.fiber || 0), 0), sugar: l.reduce((t, x) => t + Number(x.nutritionTotal?.sugar || 0), 0), sodium: l.reduce((t, x) => t + Number((x.nutritionTotal as any)?.sodium || 0), 0) }} />
        </>
      ) : (
        <>
          <MyFoodsTab deleteCustom={deleteCustom} duplicate={duplicate} favOnly={favOnly} filtered={filtered} mineOnly={mineOnly} openEdit={openEdit} openNew={openNew} q={q} setFavOnly={setFavOnly} setMineOnly={setMineOnly} toggleFavorite={toggleFavorite} setQ={setQ} />
        </>
      )}

      <BarcodeScanner visible={scanning} onClose={() => setScanning(false)} onCode={onBarcode} />
      <FoodEditorModal editor={editor} editorId={editorId} saveEditor={saveEditor} setEditor={setEditor} />
    </Screen>
  );
}
