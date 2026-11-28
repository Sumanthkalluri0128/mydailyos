// Safe intake heads-up: eating far too little or far too much, what that does to the body, and exactly what to do now and next.
// Shown only when intake needs it. Tap the card to open the details. Logic: utils/intakeSafety.ts (works offline).
import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { read, useRefreshOnSync } from '../utils/offline';
import { today } from '../config/api';
import { intakeAdvice, type IntakeAdvice } from '../utils/intakeSafety';

const addDays = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

export function SafeIntakeCard({ eaten, budget, target, sex, losing }: { eaten: number; budget: number; target: number; sex?: string; losing?: boolean }) {
  const { S, colors } = useThemedStyles();
  const [recent, setRecent] = useState<{ calories: number }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const to = today();
    try { const r = await read<{ days: { date: string; calories: number }[] }>(`/api/progress/history?from=${addDays(to, -4)}&to=${addDays(to, -1)}`); setRecent((r.days || []).filter((d) => d.date < to)); } catch { /* optional */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRefreshOnSync(() => load());

  const list: IntakeAdvice[] = intakeAdvice({ eaten, budget, target, sex, hour: new Date().getHours(), recentDays: recent, losing });
  if (!list.length) return null;
  return (
    <View>
      {list.map((a) => {
        const isOpen = open === a.kind;
        const tint = a.level === 'alert' ? colors.danger : colors.primary;
        return (
          <View key={a.kind} style={[S.card, { borderWidth: 1.5, borderColor: tint }]} accessibilityLabel={a.title}>
            <TouchableOpacity onPress={() => setOpen(isOpen ? null : a.kind)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={{ minHeight: 44 }}>
              <View style={S.between}>
                <Text style={{ fontWeight: '800', color: a.level === 'alert' ? colors.danger : colors.ink, fontSize: 15, flex: 1 }}>{a.level === 'alert' ? '⚠️ ' : 'ℹ️ '}{a.title}</Text>
                <Text style={{ color: colors.muted }}>{isOpen ? '▾' : '▸'}</Text>
              </View>
              <Text style={[S.muted, { marginTop: 4 }]}>{a.summary}</Text>
              {!isOpen && <Text style={{ color: tint, fontWeight: '700', fontSize: 12, marginTop: 6 }}>See what it does and what to do</Text>}
            </TouchableOpacity>
            {isOpen && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 4 }}>What this can do to your body</Text>
                {a.effects.map((t, i) => <Text key={i} style={{ color: colors.ink, fontSize: 13, lineHeight: 19, marginBottom: 4 }}>• {t}</Text>)}
                <Text style={{ fontWeight: '800', color: colors.ink, marginTop: 10, marginBottom: 4 }}>Do this now</Text>
                {a.doNow.map((t, i) => <Text key={i} style={{ color: colors.ink, fontSize: 13, lineHeight: 19, marginBottom: 4 }}>{i + 1}. {t}</Text>)}
                {!!a.next?.length && <>
                  <Text style={{ fontWeight: '800', color: colors.ink, marginTop: 10, marginBottom: 4 }}>Then, over the next days</Text>
                  {a.next.map((t, i) => <Text key={i} style={{ color: colors.ink, fontSize: 13, lineHeight: 19, marginBottom: 4 }}>• {t}</Text>)}
                </>}
                {!!a.seeDoctor && <Text style={[S.muted, { marginTop: 10 }]}>{a.seeDoctor}</Text>}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
