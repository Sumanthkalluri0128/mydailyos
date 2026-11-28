// The add / edit custom food form (a modal). Split out of app/food.tsx; it gets everything it needs as props.
import { Modal, ScrollView, Text, TouchableOpacity, View, KeyboardAvoidingView } from 'react-native';
import { Button, Field, useThemedStyles } from '../UI';
import { MICRO_FIELDS } from './foodHelpers';

export function FoodEditorModal(props: any) {
  const { editor, editorId, saveEditor, setEditor } = props;
  const { colors } = useThemedStyles();
  return (
    <>
    <Modal visible={!!editor} transparent animationType="fade" onRequestClose={() => setEditor(null)}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(15,18,35,0.45)', justifyContent: 'center', padding: 20 }}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '88%' }} contentContainerStyle={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 22, padding: 20 }}>
          {editor && (
            <>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 14 }}>{editorId ? 'Edit food' : 'Add a custom food'}</Text>
              <Field label="Name" value={editor.name} onChangeText={(v) => setEditor({ ...editor, name: v })} placeholder="Homemade dal" />
              <Field label="Brand (optional)" value={editor.brand} onChangeText={(v) => setEditor({ ...editor, brand: v })} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="Serving size" value={editor.servingSize} onChangeText={(v) => setEditor({ ...editor, servingSize: v })} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Unit" value={editor.servingUnit} onChangeText={(v) => setEditor({ ...editor, servingUnit: v })} placeholder="g / ml / cup" /></View>
              </View>
              <Field label="Calories (per serving)" value={editor.calories} onChangeText={(v) => setEditor({ ...editor, calories: v })} keyboardType="decimal-pad" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="Protein (g)" value={editor.protein} onChangeText={(v) => setEditor({ ...editor, protein: v })} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Carbs (g)" value={editor.carbohydrates} onChangeText={(v) => setEditor({ ...editor, carbohydrates: v })} keyboardType="decimal-pad" /></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="Fat (g)" value={editor.fat} onChangeText={(v) => setEditor({ ...editor, fat: v })} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Fiber (g)" value={editor.fiber} onChangeText={(v) => setEditor({ ...editor, fiber: v })} keyboardType="decimal-pad" /></View>
              </View>
              <Field label="Sugar (g)" value={editor.sugar} onChangeText={(v) => setEditor({ ...editor, sugar: v })} keyboardType="decimal-pad" />
              <Text style={{ fontWeight: '800', color: colors.ink, marginTop: 8 }}>Vitamins and minerals (optional, leave blank if unknown)</Text>
              {MICRO_FIELDS.map(([k, label]) => <Field key={k} label={label} value={editor[k]} onChangeText={(v) => setEditor({ ...editor, [k]: v })} keyboardType="decimal-pad" />)}
              <Field label="Notes (optional)" value={editor.notes} onChangeText={(v) => setEditor({ ...editor, notes: v })} />
              <Button title={editorId ? 'Save changes' : 'Add food'} onPress={saveEditor} />
              <TouchableOpacity onPress={() => setEditor(null)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}
