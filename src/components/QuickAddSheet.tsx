import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { TextLog } from './TextLog';
import { EatingOut } from './EatingOut';
import { useNotifications } from './Notifications';
import { today } from '../config/api';
import { write } from '../utils/offline';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const TABS: [string, string][] = [['type', '✍️ Type it'], ['out', '🍽️ Eating out'], ['recent', '🕘 Recent']];

/** Bottom sheet with the fast ways to add food, so the main screen stays calm. */
export function QuickAddSheet({ visible, onClose, meal, setMeal, recent, onLogged, initialText }: {
  visible: boolean; onClose: () => void; meal: string; setMeal: (m: string) => void; recent: any[]; onLogged: () => void; initialText?: string;
}) {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [tab, setTab] = useState('type');
  React.useEffect(() => { if (initialText) setTab('type'); }, [initialText, visible]);

  const logAgain = async (food: any) => {
    try {
      await write('POST', '/api/food-logs', { foodId: food._id, date: today(), mealType: meal, quantity: food.servingSize, clientId: `rc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, food.name, {
        foodName: food.name, consumedQuantity: food.servingSize, servingUnit: food.servingUnit, servings: 1,
        nutritionTotal: { calories: food.calories, protein: food.protein || 0, carbohydrates: food.carbohydrates || 0, fat: food.fat || 0, fiber: food.fiber || 0, sugar: food.sugar || 0 },
      });
      success('Added', `${food.name} → ${meal}`);
      onLogged();
    } catch (e: any) { error('Could not add', e.message); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} accessibilityLabel="Close quick add" />
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '86%', paddingTop: 8 }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 10 }} />
        <View style={[S.between, { paddingHorizontal: 18 }]}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>Quick add</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Done</Text></TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{MEALS.map((m) => <Chip key={m} small label={m} active={meal === m} onPress={() => setMeal(m)} />)}</View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>{TABS.map(([id, label]) => <Chip key={id} small label={label} active={tab === id} onPress={() => setTab(id)} />)}</View>
          {tab === 'type' && <TextLog meal={meal} onLogged={onLogged} initialText={initialText} />}
          {tab === 'out' && <EatingOut meal={meal} onLogged={onLogged} />}
          {tab === 'recent' && (recent.length ? recent.map((f) => (
            <TouchableOpacity key={f._id} accessibilityRole="button" accessibilityLabel={`Add ${f.name} to ${meal}`} onPress={() => logAgain(f)} style={[S.row, { minHeight: 52, borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={{ flex: 1, paddingVertical: 8 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{f.name}</Text><Text style={S.muted}>{f.servingSize} {f.servingUnit} · {Math.round(f.calories)} kcal</Text></View>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 22 }}>＋</Text>
            </TouchableOpacity>
          )) : <Text style={S.muted}>Foods you log will show up here for one-tap re-adding.</Text>)}
        </ScrollView>
      </View>
    </Modal>
  );
}
