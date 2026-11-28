import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../utils/theme';

const a = [['🍎', 'Food', '/food'], ['🏋️', 'Exercise', '/exercise'], ['💧', 'Water', '/water'], ['⚖️', 'Weight', '/weight'], ['🔥', 'Habits', '/habits'], ['👟', 'Health & Steps', '/health'], ['⏱️', 'Fasting', '/fasting'], ['📸', 'Progress Photos', '/photos']];

export default function Log() {
  const { colors: c } = useTheme();
  const s = makeStyles(c);
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.title}>Add to Today</Text>
        <Text style={s.sub}>Choose what you want to record.</Text>
        {a.map(x => (
          <TouchableOpacity key={x[1]} style={s.item} onPress={() => router.push(x[2] as any)}>
            <Text style={s.e}>{x[0]}</Text>
            <Text style={s.t}>{x[1]}</Text>
            <Text style={s.arrow}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    page: { padding: 20 },
    title: { fontSize: 30, fontWeight: '800', color: c.ink },
    sub: { color: c.muted, marginTop: 6, marginBottom: 22 },
    item: { backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 20, padding: 20, marginBottom: 12 },
    e: { fontSize: 25 },
    t: { fontSize: 17, fontWeight: '700', marginTop: 8, color: c.ink },
    arrow: { position: 'absolute', right: 18, top: 26, fontSize: 28, color: c.muted },
  });
}

// A crash in this tab shows a friendly retry screen (and is reported to Sentry) instead of closing the app.
export { ScreenError as ErrorBoundary } from '../../components/ScreenError';
