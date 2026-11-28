import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';
import { post } from '../config/api';
import { scaleItems, totalFromPerServing, withBase } from '../utils/recipeScale';

type Item = { foodId: string; foodName: string; quantity: number | string | null; baseQuantity?: number | string | null; servingUnit: string; raw: string; warnings: string[] };
type Draft = { name: string; servings: number; baseServings: number; servingsFound: boolean; items: Item[]; unmatched: string[]; perServing: Record<string, number>; note: string; steps: string[]; sourceUrl: string };
export type ImportedRecipe = { name: string; servings: number; notes: string; items: Item[] };

const looksLikeLink = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

/** Import a recipe from a link or pasted text. Nothing is saved here: "Use this recipe" opens it in the normal recipe editor. */
export function RecipeImport({ onUse, onCancel }: { onUse: (r: ImportedRecipe) => void; onCancel: () => void }) {
  const { S, colors } = useThemedStyles();
  const { error } = useNotifications();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const read = async () => {
    setBusy(true);
    try {
      const d = await post<any>('/api/recipes/import', looksLikeLink(input) ? { url: input.trim() } : { text: input });
      setDraft({ ...d, baseServings: d.servings, items: withBase(d.items) });
    } catch (e: any) { error('Could not read that recipe', e.network ? 'Importing needs a connection.' : e.message); } finally { setBusy(false); }
  };
  const setServings = (n: number) => {
    const s = Math.max(0.5, Math.min(200, Number(n) || 0.5));
    setDraft((d) => (d ? { ...d, servings: s, items: scaleItems(d.items, d.baseServings, s) } : d));
  };
  const total = draft ? totalFromPerServing(draft.perServing, draft.servings) : null;
  const usable = draft ? draft.items.filter((i) => Number(i.quantity) > 0) : [];
  const btn = (label: string, onPress: () => void, disabled = false, soft = false) => (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[soft ? { minHeight: 44, justifyContent: 'center', alignItems: 'center' } : S.button, { opacity: disabled ? 0.5 : 1 }]}>
      <Text style={soft ? { color: colors.muted, fontWeight: '800' } : S.buttonText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[S.card, { marginTop: 12 }]} accessibilityLabel="Import a recipe">
      <Text style={{ fontWeight: '800', color: colors.ink }}>Import a recipe</Text>
      <TextInput accessibilityLabel="Recipe link or text" style={[S.input, { minHeight: 110, textAlignVertical: 'top' }]} multiline maxLength={60000} value={input}
        placeholder="Paste a link (https://…) or the recipe text: title, Serves 4, Ingredients, Method" onChangeText={(t) => { setInput(t); setDraft(null); }} />
      {!draft && <>{btn(busy ? 'Reading…' : looksLikeLink(input) ? 'Import from link' : 'Read the recipe', read, busy || !input.trim())}{btn('Cancel', onCancel, false, true)}</>}
      {draft && (
        <View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 6 }}>{draft.name}</Text>
          <View style={[S.row, { marginVertical: 8 }]} accessibilityLabel="Servings">
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fewer servings" onPress={() => setServings(draft.servings - 1)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, color: colors.primary, fontWeight: '800' }}>−</Text></TouchableOpacity>
            <Text style={{ color: colors.ink, flex: 1, textAlign: 'center' }}><Text style={{ fontWeight: '800' }}>{draft.servings}</Text> serving{draft.servings === 1 ? '' : 's'}{draft.servingsFound ? '' : ' (not stated, please check)'}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="More servings" onPress={() => setServings(draft.servings + 1)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, color: colors.primary, fontWeight: '800' }}>+</Text></TouchableOpacity>
          </View>
          <Text style={S.muted}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{Math.round(draft.perServing.calories)} kcal</Text> per serving · P {draft.perServing.protein} g · C {draft.perServing.carbohydrates} g · F {draft.perServing.fat} g{'\n'}Whole recipe: {Math.round(total!.calories)} kcal
          </Text>
          {!!draft.note && <Text style={[S.muted, { marginTop: 6 }]}>{draft.note}</Text>}
          {draft.items.map((it, i) => (
            <View key={`${it.foodId}-${i}`} style={[S.item, { marginTop: 8 }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{it.foodName}</Text>
              <Text style={[S.muted, { fontSize: 12 }]}>{it.raw}</Text>
              {(it.warnings || []).map((w, k) => <Text key={k} style={[S.muted, { fontSize: 12 }]}>{w}</Text>)}
              <View style={S.row}>
                <TextInput accessibilityLabel={`${it.foodName} amount in ${it.servingUnit}`} style={[S.input, { flex: 1 }]} keyboardType="decimal-pad" value={it.quantity == null ? '' : String(it.quantity)}
                  onChangeText={(v) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, quantity: v, baseQuantity: v === '' ? null : (Number(v) * draft.baseServings) / draft.servings } : x)) })} />
                <Text style={[S.muted, { marginLeft: 8 }]}>{it.servingUnit}</Text>
              </View>
            </View>
          ))}
          {draft.unmatched.length > 0 && <Text style={[S.muted, { marginTop: 8 }]}>Could not match: {draft.unmatched.join(', ')}. Add them in the editor with + Add ingredient.</Text>}
          {btn('Use this recipe', () => onUse({ name: draft.name, servings: draft.servings, notes: [draft.sourceUrl && `Source: ${draft.sourceUrl}`, ...(draft.steps || [])].filter(Boolean).join('\n').slice(0, 1000), items: usable }), !usable.length)}
          {btn('Back', () => setDraft(null), false, true)}
        </View>
      )}
    </View>
  );
}
