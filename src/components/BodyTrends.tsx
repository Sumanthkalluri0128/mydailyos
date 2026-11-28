// Weight screen add-on: waist / hips / chest / arm / thigh trends next to weight (server: /api/health-logs/measure-trends).
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useThemedStyles } from './UI';
import { get, today } from '../config/api';
import { isGentle } from '../utils/coachTone';

const LABEL: Record<string, string> = { waist: 'Waist', hips: 'Hips', chest: 'Chest', arm: 'Arm', thigh: 'Thigh' };
type Pt = { date: string; value: number };

function Spark({ points, color, label }: { points: Pt[]; color: string; label: string }) {
  if (!points || points.length < 2) return <View style={{ width: 96, height: 30 }} />;
  const w = 96, h = 30, vs = points.map((p) => p.value), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * (w - 6) + 3), ys = vs.map((v) => h - 4 - ((v - lo) / span) * (h - 8));
  return (
    <Svg width={w} height={h} accessibilityLabel={label}>
      <Polyline points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} fill={color} />
    </Svg>
  );
}

export function BodyTrends() {
  const { S, colors } = useThemedStyles();
  const [d, setD] = useState<any>(null);
  useEffect(() => { let alive = true; get<any>(`/api/health-logs/measure-trends?days=90&today=${today()}`).then((j) => { if (alive && j?.success) setD(j); }).catch(() => {}); return () => { alive = false; }; }, []);
  const rows: [string, any][] = d ? Object.entries(d.types) : [];
  if (!d || (!rows.length && !(d.weight?.points?.length > 1))) return null;
  const hide = isGentle();
  const Row = ({ name, s, unit }: { name: string; s: any; unit: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ width: 64, fontWeight: '800', color: colors.ink }}>{name}</Text>
      <Spark points={s.points} color={colors.primary} label={`${name} trend`} />
      <Text style={{ flex: 1, textAlign: 'right', fontWeight: '700', color: colors.ink }}>{hide && name === 'Weight' ? '' : `${s.last} ${unit}`}{s.change !== null && !(hide && name === 'Weight') ? ` (${s.change > 0 ? '+' : ''}${s.change})` : ''}</Text>
    </View>
  );
  return (
    <View style={S.card}>
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>Measurements and weight</Text>
      <Text style={S.muted}>Last 90 days. Add measurements in Health. Measure at the same spot and time of day.</Text>
      {d.weight?.points?.length > 1 && <Row name="Weight" s={d.weight} unit="kg" />}
      {rows.map(([k, s]) => <Row key={k} name={LABEL[k]} s={s} unit="cm" />)}
      {!!d.note && <Text style={[S.muted, { marginTop: 10, color: colors.ink }]}>{d.note}</Text>}
    </View>
  );
}
