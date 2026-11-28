import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Share, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ListScreen, Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import Buddy from '../motion/Buddy';
import { FoodSearch } from '../components/FoodSearch';
import { RecipeImport, ImportedRecipe } from '../components/RecipeImport';
import { useNotifications } from '../components/Notifications';
import { del, get, post, put, today } from '../config/api';

type Ing = { foodId: string; foodName: string; quantity: string; servingUnit: string };
type Draft = { _id?: string; name: string; servings: string; notes: string; ingredients: Ing[] };
const KEYS = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber'] as const;

export default function Recipes() {
  const { S, colors } = useThemedStyles();
  const { error, success, undoableDelete } = useNotifications();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [foods, setFoods] = useState<Record<string, any>>({});
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    try { setRecipes((await get<any>('/api/recipes')).recipes || []); }
    catch (e: any) { error('Could not load recipes', e.network ? 'Recipes need a connection.' : e.message); }
  }, [error]);
  useEffect(() => { load(); }, [load]);

  const preview = useMemo(() => {
    if (!draft) return null;
    const sum: Record<string, number> = { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0 };
    for (const ing of draft.ingredients) {
      const f = foods[ing.foodId]; if (!f) continue;
      const k = (Number(ing.quantity) || 0) / (f.servingSize || 1);
      KEYS.forEach((key) => { sum[key] += (f[key] || 0) * k; });
    }
    const n = Math.max(Number(draft.servings) || 1, 0.25);
    return Object.fromEntries(KEYS.map((key) => [key, Math.round((sum[key] / n) * 10) / 10])) as Record<string, number>;
  }, [draft, foods]);

  const edit = async (r: any) => {
    const entries = await Promise.all(r.ingredients.map((i: any) => get<any>(`/api/foods/${i.foodId}`).then((d) => d.food).catch(() => null)));
    setFoods((m) => ({ ...m, ...Object.fromEntries(entries.filter(Boolean).map((f: any) => [f._id, f])) }));
    setDraft({ _id: r._id, name: r.name, servings: String(r.servings), notes: r.notes || '', ingredients: r.ingredients.map((i: any) => ({ foodId: String(i.foodId), foodName: i.foodName, quantity: String(i.quantity), servingUnit: i.servingUnit })) });
  };

  const save = async () => {
    if (!draft) return;
    const body = { name: draft.name, servings: Number(draft.servings), notes: draft.notes, ingredients: draft.ingredients.map((i) => ({ foodId: i.foodId, quantity: Number(i.quantity) })) };
    try {
      if (draft._id) await put(`/api/recipes/${draft._id}`, body); else await post('/api/recipes', body);
      success('Saved', 'Find it in your foods to log or plan.');
      setDraft(null); load();
    } catch (e: any) { error('Could not save', e.network ? 'Saving a recipe needs a connection.' : e.message); }
  };
  const share = (r: any) => Share.share({
    message: `${r.name} — makes ${r.servings} servings\n` + r.ingredients.map((i: any) => `• ${i.foodName}: ${i.quantity} ${i.servingUnit}`).join('\n') +
      `\nPer serving: ${Math.round(r.perServing.calories)} kcal, ${r.perServing.protein} g protein, ${r.perServing.fiber} g fibre` + (r.notes ? `\n\n${r.notes}` : ''),
  }).catch(() => {});
  // Meal prep: cook a batch once, then log "1 portion" per meal and watch the count go down.
  const mealNow = () => { const h = new Date().getHours(); return h < 10 ? 'breakfast' : h < 16 ? 'lunch' : h < 18 ? 'snacks' : 'dinner'; };
  // Shared pot: "I cooked a pot" (servings and/or total cooked weight), then "I ate x servings / x g". Nutrition scales from the recipe.
  type Pot = { id: string; mode: 'cook' | 'eat'; servings: string; totalG: string; grams: string; by: 'servings' | 'grams'; meal: string; hasWeight: boolean };
  const [pot, setPot] = useState<Pot | null>(null);
  const openPot = (r: any, mode: 'cook' | 'eat') => setPot({ id: r._id, mode, servings: String(mode === 'cook' ? r.servings : 1), totalG: '', grams: '', by: 'servings', meal: mealNow(), hasWeight: (r.potServingG || 0) > 0 });
  const sendPot = async (r: any) => {
    if (!pot) return;
    try {
      if (pot.mode === 'cook') {
        const d = await post<any>(`/api/recipes/${r._id}/cook`, { servings: Number(pot.servings) || undefined, totalG: pot.totalG ? Number(pot.totalG) : undefined });
        success('Pot saved', `${d.pot?.servings ?? r.servings} servings of ${r.name}${d.pot?.servingG ? `, about ${Math.round(d.pot.servingG)} g each` : ''}.`);
      } else {
        const d = await post<any>(`/api/recipes/${r._id}/eat`, { date: today(), mealType: pot.meal, ...(pot.by === 'grams' ? { grams: Number(pot.grams) } : { portions: Number(pot.servings) }), clientId: `pot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
        success('Logged', `${d.servings} serving${d.servings === 1 ? '' : 's'} of ${r.name} added to ${pot.meal}.${d.moreThanLeft ? ' That was more than the pot had left, so the pot is now empty.' : ''}`);
        if (d.sticker === 'pot') success('Sticker unlocked 🥘', 'Pot Boss! Your first shared-pot meal.');
      }
      setPot(null); load();
    } catch (e: any) { error('Could not save', e.network ? 'Shared pots need a connection.' : e.message); }
  };

  // Import from a link or pasted recipe -> opens in the normal editor (nothing is saved until Save recipe)
  const [importing, setImporting] = useState(false);
  const useImported = async (r: ImportedRecipe) => {
    const entries = await Promise.all(r.items.map((i) => get<any>(`/api/foods/${i.foodId}`).then((d) => d.food).catch(() => null)));
    setFoods((m) => ({ ...m, ...Object.fromEntries(entries.filter(Boolean).map((f: any) => [f._id, f])) }));
    setDraft({ name: r.name.slice(0, 100), servings: String(r.servings), notes: r.notes, ingredients: r.items.map((i) => ({ foodId: i.foodId, foodName: i.foodName, quantity: String(i.quantity), servingUnit: i.servingUnit })) });
    setImporting(false);
  };

  // Paste ingredients -> editable draft (nothing is saved until Save recipe)
  type DraftItem = { foodId: string; foodName: string; quantity: string | number | null; servingUnit: string; confidence: string; warnings: string[] };
  const [pasting, setPasting] = useState<{ text: string; draft: { items: DraftItem[]; unmatched: string[]; oilTspPerServing: number } | null } | null>(null);
  const readPaste = async () => {
    if (!pasting || !draft) return;
    try {
      const d = await post<any>('/api/recipes/parse-ingredients', { text: pasting.text, servings: Number(draft.servings) || 4 });
      setPasting({ ...pasting, draft: { ...d, items: d.items.map((i: any) => ({ ...i, quantity: i.quantity == null ? '' : String(i.quantity) })) } });
    } catch (e: any) { error('Could not read that list', e.network ? 'This needs a connection.' : e.message); }
  };
  const usePaste = async () => {
    if (!pasting?.draft || !draft) return;
    const items = pasting.draft.items.filter((i) => Number(i.quantity) > 0);
    const entries = await Promise.all(items.map((i) => get<any>(`/api/foods/${i.foodId}`).then((d) => d.food).catch(() => null)));
    setFoods((m) => ({ ...m, ...Object.fromEntries(entries.filter(Boolean).map((f: any) => [f._id, f])) }));
    setDraft({ ...draft, ingredients: [...draft.ingredients, ...items.map((i) => ({ foodId: i.foodId, foodName: i.foodName, quantity: String(i.quantity), servingUnit: i.servingUnit }))] });
    setPasting(null);
  };
  const remove = async (r: any) => {
    const before = recipes;
    setRecipes((cur) => cur.filter((x) => x._id !== r._id));
    undoableDelete(`“${r.name}” removed`, async () => {
      try { await del(`/api/recipes/${r._id}`); load(); } catch (e: any) { setRecipes(before); error('Could not delete', e.message); }
    }, () => setRecipes(before));
  };

  if (draft) {
    const valid = draft.name.trim() && draft.ingredients.length > 0 && Number(draft.servings) > 0;
    return (
      <Screen>
        <TouchableOpacity onPress={() => setDraft(null)} accessibilityRole="button" accessibilityLabel="Back to recipes"><Text style={S.back}>‹ Recipes</Text></TouchableOpacity>
        <Text style={S.title}>{draft._id ? 'Edit recipe' : 'New recipe'}</Text>
        <View style={S.card}>
          <Text style={S.label}>Name</Text>
          <TextInput accessibilityLabel="Recipe name" style={S.input} value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="e.g. Rajma masala" placeholderTextColor={colors.muted} maxLength={100} />
          <Text style={S.label}>Makes how many servings?</Text>
          <TextInput accessibilityLabel="Servings" style={S.input} keyboardType="decimal-pad" value={draft.servings} onChangeText={(v) => setDraft({ ...draft, servings: v })} />
          <Text style={S.label}>Ingredients</Text>
          {draft.ingredients.map((ing, i) => (
            <View key={`${ing.foodId}-${i}`} style={[S.row, { marginBottom: 8 }]}>
              <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }} numberOfLines={2}>{ing.foodName}</Text>
              <TextInput accessibilityLabel={`Amount of ${ing.foodName}`} style={[S.input, { width: 84, marginBottom: 0, minHeight: 44, paddingVertical: 8 }]} keyboardType="decimal-pad" value={ing.quantity} onChangeText={(v) => setDraft({ ...draft, ingredients: draft.ingredients.map((x, j) => (j === i ? { ...x, quantity: v } : x)) })} />
              <Text style={{ width: 34, marginLeft: 6, color: colors.muted }}>{ing.servingUnit}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${ing.foodName}`} onPress={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, j) => j !== i) })}><Text style={S.delete}>✕</Text></TouchableOpacity>
            </View>
          ))}
          {pasting ? (
            <View style={{ backgroundColor: colors.chipBg, borderRadius: 14, padding: 12, marginVertical: 8 }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>Paste your ingredients</Text>
              <TextInput accessibilityLabel="Ingredient list" style={[S.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={pasting.text} onChangeText={(v) => setPasting({ ...pasting, text: v, draft: null })} placeholder="2 cups rice, 1 cup toor dal, 2 tbsp oil" placeholderTextColor={colors.muted} maxLength={2000} />
              {!pasting.draft && <TouchableOpacity accessibilityRole="button" disabled={!pasting.text.trim()} onPress={readPaste} style={[S.button, { opacity: pasting.text.trim() ? 1 : 0.5 }]}><Text style={S.buttonText}>Read the list</Text></TouchableOpacity>}
              {pasting.draft && <>
                {pasting.draft.items.map((it, i) => (
                  <View key={`${it.foodId}-${i}`} style={{ marginBottom: 6 }}>
                    <View style={S.row}>
                      <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }} numberOfLines={2}>{it.foodName}{it.confidence === 'medium' ? ' ?' : ''}</Text>
                      <TextInput accessibilityLabel={`Amount of ${it.foodName}`} placeholder="amount" placeholderTextColor={colors.muted} style={[S.input, { width: 84, marginBottom: 0, minHeight: 44, paddingVertical: 8 }]} keyboardType="decimal-pad" value={String(it.quantity ?? '')} onChangeText={(v) => setPasting({ ...pasting, draft: { ...pasting.draft!, items: pasting.draft!.items.map((x, j) => (j === i ? { ...x, quantity: v } : x)) } })} />
                      <Text style={{ width: 34, marginLeft: 6, color: colors.muted }}>{it.servingUnit}</Text>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${it.foodName}`} onPress={() => setPasting({ ...pasting, draft: { ...pasting.draft!, items: pasting.draft!.items.filter((_, j) => j !== i) } })}><Text style={S.delete}>✕</Text></TouchableOpacity>
                    </View>
                    {it.warnings.map((w) => <Text key={w} style={[S.muted, { fontSize: 12 }]}>{w}</Text>)}
                  </View>
                ))}
                {!!pasting.draft.unmatched.length && <Text style={S.muted}>Could not find: {pasting.draft.unmatched.join(', ')}. Add them with + Add ingredient.</Text>}
                {pasting.draft.oilTspPerServing > 0 && <Text style={S.muted}>Added oil: about {pasting.draft.oilTspPerServing} tsp per serving, roughly {Math.round(pasting.draft.oilTspPerServing * 40)} kcal.</Text>}
                <TouchableOpacity accessibilityRole="button" onPress={usePaste} style={S.button}><Text style={S.buttonText}>Use these ingredients</Text></TouchableOpacity>
              </>}
              <TouchableOpacity accessibilityRole="button" onPress={() => setPasting(null)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
            </View>
          ) : <TouchableOpacity accessibilityRole="button" onPress={() => setPasting({ text: '', draft: null })} style={{ paddingVertical: 10 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>📋 Paste ingredients</Text></TouchableOpacity>}
          {picking
            ? <FoodSearch actionLabel="Add ingredient" onCancel={() => setPicking(false)} onPick={(f, q) => { setFoods((m) => ({ ...m, [f._id]: f })); setDraft({ ...draft, ingredients: [...draft.ingredients, { foodId: f._id, foodName: f.name, quantity: String(q), servingUnit: f.servingUnit }] }); setPicking(false); }} />
            : <TouchableOpacity accessibilityRole="button" onPress={() => setPicking(true)} style={{ paddingVertical: 10 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>+ Add ingredient</Text></TouchableOpacity>}
          {preview && draft.ingredients.length > 0 && (
            <View style={{ backgroundColor: colors.chipBg, borderRadius: 14, padding: 12, marginVertical: 8 }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>Per serving</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{Math.round(preview.calories)} kcal · {preview.protein} g protein · {preview.carbohydrates} g carbs · {preview.fat} g fat · {preview.fiber} g fibre</Text>
            </View>
          )}
          <Text style={S.label}>Notes (optional)</Text>
          <TextInput accessibilityLabel="Notes" style={[S.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline value={draft.notes} onChangeText={(v) => setDraft({ ...draft, notes: v })} maxLength={1000} />
          <TouchableOpacity accessibilityRole="button" disabled={!valid} onPress={save} style={[S.button, { opacity: valid ? 1 : 0.5 }]}><Text style={S.buttonText}>Save recipe</Text></TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <ListScreen buddyWho="luffy" buddy="chef" buddySays="Let's cook!"
      data={recipes} keyExtractor={(r) => r._id}
      header={<>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Recipes</Text>
      <Text style={S.sub}>Combine ingredients once, then log or plan a serving in one tap.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => setDraft({ name: '', servings: '4', notes: '', ingredients: [] })} style={S.button}><Text style={S.buttonText}>+ New recipe</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => setImporting(true)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>🔗 Import recipe</Text></TouchableOpacity>
      {importing && <RecipeImport onUse={useImported} onCancel={() => setImporting(false)} />}
      <View style={{ height: 14 }} />
      </>}
      empty={<Text style={S.muted}>No recipes yet. A saved recipe appears in your food list, per serving.</Text>}
      renderItem={({ item: r }) => (
        <View style={S.item}>
          <View style={S.between}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '800' }}>{r.name}</Text>
              <Text style={S.muted}>{r.servings} servings · {Math.round(r.perServing.calories)} kcal, {r.perServing.protein} g protein, {r.perServing.fiber} g fibre each</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={() => share(r)} style={{ marginRight: 14 }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Share</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => edit(r)} style={{ marginRight: 14 }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Edit</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete ${r.name}`} onPress={() => remove(r)}><Text style={S.delete}>Delete</Text></TouchableOpacity>
          </View>
          <View style={[S.row, { marginTop: 10, flexWrap: 'wrap' }]}>
            <Buddy scene="chef" size={30} />
            <Text style={{ fontWeight: '800', color: (r.portionsLeft || 0) > 0 ? colors.primary : colors.muted, marginHorizontal: 8 }}>{r.portionsLeft || 0} serving{(r.portionsLeft || 0) === 1 ? '' : 's'} left in the pot</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => openPot(r, 'cook')} style={{ marginRight: 14, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>🥘 I cooked a pot</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => openPot(r, 'eat')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>I ate…</Text></TouchableOpacity>
          </View>
          {pot?.id === r._id && (
            <View style={{ marginTop: 8 }}>
              {pot.mode === 'cook' ? <>
                <Text style={S.label}>Servings the pot makes</Text>
                <TextInput accessibilityLabel="Servings the pot makes" style={S.input} keyboardType="decimal-pad" value={pot.servings} onChangeText={(v) => setPot({ ...pot, servings: v })} />
                <Text style={S.label}>Total cooked weight in grams (optional, lets you log by grams)</Text>
                <TextInput accessibilityLabel="Total cooked weight in grams" style={S.input} keyboardType="decimal-pad" value={pot.totalG} onChangeText={(v) => setPot({ ...pot, totalG: v })} />
              </> : <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Chip small label="Servings" active={pot.by === 'servings'} onPress={() => setPot({ ...pot, by: 'servings' })} />
                  {pot.hasWeight && <Chip small label="Grams" active={pot.by === 'grams'} onPress={() => setPot({ ...pot, by: 'grams' })} />}
                </View>
                {pot.by === 'grams'
                  ? <><Text style={S.label}>Grams eaten</Text><TextInput accessibilityLabel="Grams eaten" style={S.input} keyboardType="decimal-pad" value={pot.grams} onChangeText={(v) => setPot({ ...pot, grams: v })} /></>
                  : <><Text style={S.label}>Servings eaten</Text><TextInput accessibilityLabel="Servings eaten" style={S.input} keyboardType="decimal-pad" value={pot.servings} onChangeText={(v) => setPot({ ...pot, servings: v })} /></>}
                {!pot.hasWeight && <Text style={[S.muted, { fontSize: 12 }]}>To log by grams, enter the total cooked weight when you cook the pot.</Text>}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{['breakfast', 'lunch', 'dinner', 'snacks'].map((m) => <Chip key={m} small label={m} active={pot.meal === m} onPress={() => setPot({ ...pot, meal: m })} />)}</View>
              </>}
              <TouchableOpacity accessibilityRole="button" onPress={() => sendPot(r)} style={S.button}><Text style={S.buttonText}>{pot.mode === 'cook' ? 'Save the pot' : 'Log it'}</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => setPot(null)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )}
    />
  );
}
