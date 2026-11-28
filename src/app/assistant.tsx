import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CHARS, WHO_LIST, dayChar, stickerFor, type Who } from '../motion/chars';
import { useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { get, post, today } from '../config/api';

// Where each answer's "open" button goes (same page ids the server uses).
const ROUTE: Record<string, string> = {
  dashboard: '/(tabs)', foodLogger: '/food', food: '/food', planner: '/plan', recipes: '/recipes', water: '/water', exercise: '/exercise',
  weight: '/weight', health: '/health', goals: '/goals', habit: '/habits', task: '/(tabs)/tasks', progress: '/(tabs)/progress', profile: '/(tabs)/profile',
};
type Msg = { id: number; from: 'me' | 'bot'; text: string; actions?: { label: string; page?: string; ask?: string; healthy?: boolean }[] };

export default function Assistant() {
  const { colors } = useThemedStyles();
  const params = useLocalSearchParams<{ who?: string }>();
  const who: Who = (WHO_LIST as string[]).includes(String(params.who)) ? (params.who as Who) : dayChar();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<string[]>(['How am I doing today?', 'What should I eat next?', 'How was my week?', 'How do I plan my week?']);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const id = useRef(1);

  useEffect(() => {
    get<any>(`/api/assistant/chips?today=${today()}&hour=${new Date().getHours()}`)
      .then((d) => { setChips(d.chips); setMsgs([{ id: id.current++, from: 'bot', text: d.greeting }]); })
      .catch(() => setMsgs([{ id: id.current++, from: 'bot', text: 'Hi! Ask me about your day, your week, or how any feature works.' }]));
  }, []);

  const ask = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText(''); setBusy(true);
    setMsgs((m) => [...m, { id: id.current++, from: 'me', text: question }]);
    try {
      const d = await post<any>('/api/assistant/ask', { question, today: today(), hour: new Date().getHours() });
      if (d.chips) setChips(d.chips);
      setMsgs((m) => [...m, { id: id.current++, from: 'bot', text: d.text, actions: d.actions }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { id: id.current++, from: 'bot', text: e?.network ? 'I could not reach the server. Check your connection and try again.' : (e?.message || 'Something went wrong.') }]);
    } finally { setBusy(false); setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); }
  }, [busy]);

  const act = (a: { page?: string; ask?: string; healthy?: boolean }) => { if (a.healthy) router.push({ pathname: '/(tabs)', params: { open: 'healthy' } } as any); else if (a.page && ROUTE[a.page]) router.push(ROUTE[a.page] as any); else if (a.ask) ask(a.ask); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: colors.primarySolid }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 8 }}><Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>‹</Text></TouchableOpacity>
          <Image source={stickerFor(who, busy ? 'think' : 'wave', 1).src} style={{ width: 52, height: 52 }} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{CHARS[who]} · your FlexFit coach</Text>
            <Text style={{ color: '#ffffffcc', fontSize: 12 }}>Knows your day, week, goals and every feature</Text>
          </View>
        </View>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 20 }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {msgs.map((m) => (
            <View key={m.id} style={{ alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '90%', marginBottom: 12 }}>
              <View style={{ backgroundColor: m.from === 'me' ? colors.primary : colors.card, borderWidth: m.from === 'me' ? 0 : 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ color: m.from === 'me' ? '#fff' : colors.ink, fontSize: 15, lineHeight: 22 }}>{m.text}</Text>
              </View>
              {!!m.actions?.length && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                  {m.actions.map((a) => <Chip key={a.label} small label={`${a.page || a.healthy ? '→ ' : ''}${a.label}`} onPress={() => act(a)} />)}
                </View>
              )}
            </View>
          ))}
          {busy && <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start', margin: 8 }} />}
        </ScrollView>
        {/* Suggestion chips: a fixed-height strip that never shrinks under a long answer (RN ScrollViews shrink by default) */}
        <View style={{ flexShrink: 0, minHeight: 56, backgroundColor: colors.bg }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, alignItems: 'flex-start' }}>
            {chips.map((c) => <Chip key={c} small label={c} onPress={() => ask(c)} />)}
          </ScrollView>
        </View>
        <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={() => ask(text)} returnKeyType="send" maxLength={300} placeholder="Ask anything: “how much protein left?”" placeholderTextColor={colors.muted}
            accessibilityLabel="Your question" style={{ flex: 1, minHeight: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: 24, paddingHorizontal: 16, color: colors.ink, fontSize: 16 }} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send" disabled={busy || !text.trim()} onPress={() => ask(text)}
            style={{ width: 48, height: 48, borderRadius: 24, marginLeft: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySolid, opacity: busy || !text.trim() ? 0.45 : 1 }}>
            <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
