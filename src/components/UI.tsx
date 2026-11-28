import { useState } from 'react';
import { AUTH } from '../motion/authSignals';
import { TabFade } from '../motion/Reveal';
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemeColors, useTheme, lightColors, lift } from '../utils/theme';
import { tapHaptic } from '../utils/haptics';
import Buddy, { type BuddyScene } from '../motion/Buddy';

// Back-compat static exports (light theme). Prefer useTheme() in new code —
// these remain so any straggler import doesn't crash, but won't repaint on
// theme changes.
export const colors: ThemeColors = lightColors;

export function buildStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg }, safe: { flex: 1, backgroundColor: c.bg },
    page: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 30, fontWeight: '800', color: c.ink, letterSpacing: -0.6 },
    sub: { fontSize: 14, color: c.muted, marginTop: 6, marginBottom: 20, lineHeight: 20 },
    muted: { color: c.muted, fontSize: 12, lineHeight: 17 },
    card: { backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 22, padding: 18, marginBottom: 14, ...lift(c, 1) },
    label: { fontSize: 13, fontWeight: '700', color: c.muted, marginBottom: 6 },
    input: { borderWidth: 1.5, borderColor: c.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50, fontSize: 16, color: c.ink, marginBottom: 13, backgroundColor: c.card },
    button: { backgroundColor: c.primarySolid, paddingVertical: 15, paddingHorizontal: 18, minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 3, ...lift(c, 2) }, buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    row: { flexDirection: 'row', alignItems: 'center' }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    item: { backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, padding: 15, borderRadius: 18, marginBottom: 9, ...lift(c, 1) }, delete: { color: c.danger, fontSize: 14, fontWeight: '700', paddingVertical: 12, paddingHorizontal: 8 }, // padding makes the tap area about 44 px
    back: { color: c.primary, fontWeight: '700', fontSize: 16, marginBottom: 20 },
  });
}

export const S = buildStyles(colors);

/**
 * Shared theme accessor. Returns the resolved colors + a StyleSheet built
 * from them, so existing screens that destructure `{ S, colors }` keep
 * working unchanged — they just repaint automatically on theme change.
 */
export function useThemedStyles() {
  const { colors: c, isDark, scheme, mode, setMode } = useTheme();
  const themedS = buildStyles(c);
  return { S: themedS, colors: c, isDark, scheme, mode, setMode };
}

export function Field(p: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; keyboardType?: any; secureTextEntry?: boolean }) {
  const { colors: c } = useTheme();
  const s = buildStyles(c);
  const [focus, setFocus] = useState(false);
  return <View>
    <Text style={s.label}>{p.label}</Text>
    <TextInput
      accessibilityLabel={p.label}
      style={[s.input, focus && { borderColor: c.primary, backgroundColor: c.raised }]}
      value={p.value} onChangeText={(t) => { AUTH.lastInput = Date.now(); p.onChangeText(t); }} placeholder={p.placeholder} placeholderTextColor={c.muted}
      keyboardType={p.keyboardType} secureTextEntry={p.secureTextEntry}
      autoCapitalize={p.keyboardType === 'email-address' ? 'none' : undefined}
      autoCorrect={p.keyboardType === 'email-address' || p.secureTextEntry ? false : undefined}
      onFocus={() => { setFocus(true); if (p.secureTextEntry) AUTH.pw = true; }} onBlur={() => { setFocus(false); if (p.secureTextEntry) AUTH.pw = false; }}
    />
  </View>;
}
export function Button(p: { title: string; onPress: () => void; disabled?: boolean }) {
  const { colors: c } = useTheme();
  const s = buildStyles(c);
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={p.title} accessibilityState={{ disabled: !!p.disabled }}
    activeOpacity={0.82} disabled={p.disabled} style={[s.button, p.disabled && { opacity: 0.55 }]}
    onPress={() => { tapHaptic(); AUTH.cheerAt = Date.now(); p.onPress(); }}><Text style={s.buttonText}>{p.title}</Text></TouchableOpacity>;
}
export function BrandHeader({ onPress = () => router.replace('/(tabs)') }: { onPress?: () => void }) {
  const { colors: c } = useTheme();
  return <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 }} accessibilityRole="button" accessibilityLabel="Go to Home">
    <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: c.primarySolid, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>✦</Text></View>
    <View><Text style={{ fontSize: 22, fontWeight: '800', color: c.ink }}>FlexFit</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>Your daily health & productivity tracker</Text></View>
  </TouchableOpacity>;
}

/**
 * Standard screen wrapper: themed SafeAreaView + a KeyboardAvoidingView that
 * actually lifts content clear of the keyboard (fixes inputs — especially
 * the reminder time fields and "add task/log" forms — getting hidden behind
 * the keyboard) + a ScrollView that keeps taps on buttons working while the
 * keyboard is open.
 */
export function Screen({ children, contentStyle, refreshControl, tab, buddy, buddySays, buddyWho }: { children: React.ReactNode; contentStyle?: ViewStyle; refreshControl?: React.ReactElement<any>; tab?: boolean; buddy?: BuddyScene; buddySays?: string; buddyWho?: any }) {
  const { colors: c } = useTheme();
  const s = buildStyles(c);
  // 'padding' is the only mode that behaves on both platforms now that Android is edge-to-edge.
  const body = (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      <ScrollView
        contentContainerStyle={[s.page, { paddingBottom: 140 }, contentStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl}
      >
        {buddy && <View style={{ alignItems: 'flex-end', marginBottom: 4 }}><Buddy scene={buddy} who={buddyWho} size={76} says={buddySays} /></View>}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
  return (
    <SafeAreaView style={s.safe}>
      {tab ? <TabFade>{body}</TabFade> : body}
    </SafeAreaView>
  );
}

/**
 * Same chrome as Screen, but the content is a FlatList, so a long list only draws the rows on screen (and a little either side).
 * Use it for lists that can grow (Recipes, history rows, library). `header` scrolls with the list; `empty` shows when data is empty.
 */
export function ListScreen<T>({ data, renderItem, keyExtractor, header, footer, empty, contentStyle, refreshControl, tab, buddy, buddySays, buddyWho, onEndReached }: {
  data: T[]; renderItem: (info: { item: T; index: number }) => React.ReactElement | null; keyExtractor: (item: T, index: number) => string;
  header?: React.ReactNode; footer?: React.ReactNode; empty?: React.ReactNode; contentStyle?: ViewStyle; refreshControl?: React.ReactElement<any>; tab?: boolean; buddy?: any; buddySays?: string; buddyWho?: any; onEndReached?: () => void;
}) {
  const { colors: c } = useTheme();
  const s = buildStyles(c);
  const body = (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[s.page, { paddingBottom: 140 }, contentStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={<>{buddy && <View style={{ alignItems: 'flex-end', marginBottom: 4 }}><Buddy scene={buddy} who={buddyWho} size={76} says={buddySays} /></View>}{header}</>}
        ListEmptyComponent={<>{empty}</>}
        ListFooterComponent={<>{footer}</>}
      />
    </KeyboardAvoidingView>
  );
  return (
    <SafeAreaView style={s.safe}>
      {tab ? <TabFade>{body}</TabFade> : body}
    </SafeAreaView>
  );
}
