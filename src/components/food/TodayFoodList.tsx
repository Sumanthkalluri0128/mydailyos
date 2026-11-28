// "Today's food": what you ate, grouped by meal. Split out of app/food.tsx; it gets everything it needs as props.
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { today } from '../../config/api';
import { addDays } from '../../utils/dates';
import { SwipeRow } from '../SwipeRow';
import { PortionEdit } from '../PortionEdit';
import { QuickCorrect } from '../QuickCorrect';
import { write } from '../../utils/offline';
import { Button, Field, useThemedStyles } from '../UI';
import { Chip } from '../Chip';
import { meals, MEAL_LABEL, MEAL_NAME, MEAL_COLOR } from './foodHelpers';

export function TodayFoodList(props: any) {
  const { TAGS, eatenToday, editBusy, editQtyId, expanded, l, mealKcal, moveLog, moveLogDay, movingId, removeLog, saveAsMeal, saveFor, saveName, saveQty, saveQuick, setEditQtyId, setExpanded, setMovingId, setSaveFor, setSaveName, setTag, setTagId, swipeDelete, tagId, meal } = props;
  const { S, colors } = useThemedStyles();
  return (
    <>
    <View style={[S.between, { marginBottom: 8 }]}>
      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.ink }}>Today's food</Text>
      <Text style={{ fontWeight: '800', color: colors.primary }}>{Math.round(eatenToday)} kcal</Text>
    </View>
    {l.length ? meals.map((m) => {
      const items = l.filter((x) => x.mealType === m);
      if (!items.length) return null;
      const total = mealKcal(m);
      const open = meal === m || !!expanded[m];
      return (
        <View key={m} style={{ marginBottom: 8 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => setExpanded((e) => ({ ...e, [m]: !open }))} style={[S.between, { paddingVertical: 8 }]} accessibilityRole="button" accessibilityLabel={`${MEAL_NAME[m]}, ${items.length} items, ${Math.round(total)} kcal, ${open ? 'collapse' : 'expand'}`}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{MEAL_LABEL[m]} <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 12 }}>· {items.length} item{items.length === 1 ? '' : 's'}</Text></Text>
            <View style={S.row}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>{Math.round(total)} kcal</Text>
              <Text style={{ color: colors.muted, fontSize: 18, marginLeft: 8 }}>{open ? '⌃' : '⌄'}</Text>
            </View>
          </TouchableOpacity>
          {open && (
            <>
              {items.map((x) => (
                <React.Fragment key={x._id}>
                  <SwipeRow onSwipeRight={() => setMovingId(x._id)} onSwipeLeft={() => swipeDelete(x)}>
                    <View style={[S.item, S.row, { borderLeftWidth: 4, borderLeftColor: MEAL_COLOR[m], paddingVertical: 10 }]}>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={{ fontWeight: '700', color: colors.ink }} numberOfLines={2}>{x.foodName}</Text>
                        <Text style={S.muted}>{Math.round(x.consumedQuantity * 10) / 10}{x.servingUnit} · {Math.round(x.nutritionTotal?.calories || 0)} kcal · {Number(x.nutritionTotal?.protein || 0).toFixed(1)}g protein</Text>
                      </View>
                      <TouchableOpacity accessibilityRole="button" onPress={() => setEditQtyId(editQtyId === x._id ? null : x._id)} style={{ marginRight: 14, minHeight: 44, justifyContent: 'center' }} accessibilityLabel={x.quick ? `Correct the estimate of ${x.foodName}` : `Edit amount of ${x.foodName}`}><Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>✏️ Edit</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => setMovingId(movingId === x._id ? null : x._id)} style={{ marginRight: 14 }} accessibilityLabel={`Move ${x.foodName} to another meal`}><Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>Move</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => setTagId(tagId === x._id ? null : x._id)} style={{ marginRight: 12 }} accessibilityLabel={`Add a reason tag to ${x.foodName}`}><Text style={{ fontSize: 16 }}>{x.trigger ? '🏷️' : '＋🏷️'}</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => removeLog(x._id)} accessibilityLabel={`Delete ${x.foodName}`}><Text style={S.delete}>✕</Text></TouchableOpacity>
                    </View>
                  </SwipeRow>
                  {editQtyId === x._id && x.quick && <QuickCorrect entry={x} busy={editBusy} onCancel={() => setEditQtyId(null)} onSave={(body) => saveQuick(x, body)} />}
                  {editQtyId === x._id && !x.quick && <PortionEdit name={x.foodName} foodId={x.foodId?._id || x.foodId} quantity={x.consumedQuantity} unit={x.servingUnit} calories={x.nutritionTotal?.calories || 0} protein={x.nutritionTotal?.protein || 0} busy={editBusy} onCancel={() => setEditQtyId(null)} onSave={(q) => saveQty(x, q)} />}
                  {tagId === x._id && (
                    <View style={[S.row, { flexWrap: 'wrap', marginBottom: 8 }]}>
                      <Text style={[S.muted, { marginRight: 8 }]}>Why? (optional, just for you)</Text>
                      {TAGS.map(([k, label]) => <Chip key={k} label={label} active={x.trigger === k} onPress={() => { setTag(x._id, x.trigger === k ? '' : k); setTagId(null); }} small />)}
                    </View>
                  )}
                  {movingId === x._id && (
                    <View style={[S.row, { flexWrap: 'wrap', marginBottom: 8 }]}>
                      <Text style={[S.muted, { marginRight: 8 }]}>Move to</Text>
                      {meals.filter((mm) => mm !== m).map((mm) => <Chip key={mm} label={MEAL_LABEL[mm] || mm} active={false} onPress={() => moveLog(x._id, mm)} small />)}
                      <Chip label="Yesterday" active={false} onPress={() => moveLogDay(x._id, addDays(today(), -1))} small />
                      <Chip label="Tomorrow" active={false} onPress={() => moveLogDay(x._id, addDays(today(), 1))} small />
                    </View>
                  )}
                </React.Fragment>
              ))}
              <View style={[S.row, { justifyContent: 'flex-end', marginBottom: 4 }]}>
                <TouchableOpacity onPress={() => { setSaveFor(saveFor === m ? null : m); setSaveName(''); }}><Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>Save {MEAL_NAME[m].toLowerCase()} as a meal</Text></TouchableOpacity>
              </View>
              {saveFor === m && (
                <View style={[S.card, { padding: 14 }]}>
                  <Field label="Name this meal" value={saveName} onChangeText={setSaveName} placeholder="My usual breakfast" />
                  <Button title="Save meal" onPress={saveAsMeal} />
                </View>
              )}
            </>
          )}
        </View>
      );
    }) : <View style={[S.card, { alignItems: 'center' }]}><Text style={{ fontSize: 34 }}>🍽️</Text><Text style={{ fontWeight: '800', color: colors.ink, marginTop: 6 }}>Nothing logged yet today</Text><Text style={[S.muted, { textAlign: 'center', marginTop: 4 }]}>Search above, or tap “Type a meal” to write what you ate in one line.</Text></View>}
    </>
  );
}
