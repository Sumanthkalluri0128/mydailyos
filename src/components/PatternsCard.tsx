// "Personal pattern insights": correlations in the person's OWN data (sleep, skipped breakfast, quiet days, the heaviest weekday).
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from './UI';
import { read } from '../utils/offline';
import { today } from '../config/api';

export function PatternsCard() {
  const { S, colors } = useThemedStyles();
  const [d, setD] = useState<{ insights: { id: string; icon: string; title: string; detail: string }[]; hasSleep: boolean } | null>(null);
  useEffect(() => { read<any>(`/api/plan/patterns?today=${today()}`).then(setD).catch(() => {}); }, []);
  if (!d) return null;
  return (
    <View style={S.card}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 8 }}>Patterns in your own data</Text>
      {d.insights.length === 0 && <Text style={S.muted}>Keep logging and patterns will appear here (they need a few weeks of data{d.hasSleep ? '' : ', and sleep data from Health Connect makes them much sharper'}).</Text>}
      {d.insights.map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', marginBottom: 10 }}>
          <Text style={{ fontSize: 22, marginRight: 10 }}>{i.icon}</Text>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: colors.ink }}>{i.title}</Text><Text style={[S.muted, { marginTop: 2 }]}>{i.detail}</Text></View>
        </View>
      ))}
    </View>
  );
}
