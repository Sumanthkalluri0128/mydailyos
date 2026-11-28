// Vitamins and minerals for a day (/api/progress/micro). Same arrows as macros; unknown data reads "Not enough data", never 0.
import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import Buddy from '../motion/Buddy';
import { read, useRefreshOnSync } from '../utils/offline';
import { today } from '../config/api';

type Row = { id: string; label: string; unit: string; status: 'low' | 'ok' | 'high' | 'nodata'; arrow: string; value?: number; pct?: number; range: { min: number; max?: number | null } };
type Low = { id: string; foods?: { name: string; mine?: boolean }[]; hint?: string };
type Micro = { ok: boolean; note?: string; rows: Row[]; mood?: 'victory' | 'low' | 'ok' | 'nodata'; knownCount?: number; inRange?: number; emptyNote?: string; source?: string; rdaVerified?: boolean; low?: Low[] };

const SCENE = { victory: 'victory', low: 'scale', ok: 'cheer', nodata: 'wave' } as const; // 'think' is not a Buddy scene (it silently fell back to 'wave'); 'scale' is what the mood map uses for think
const HEAD = { victory: 'Power-ups on point!', low: 'A few power-ups are running low', ok: 'Looking steady', nodata: 'Not enough vitamin data yet' } as const;

// Nutrients that most often run short while eating less. They are listed first (with a star) when the person is losing weight.
const DEFICIT_FIRST = ['iron', 'calcium', 'vitaminD', 'vitaminB12', 'magnesium', 'potassium', 'zinc'];

/** `embedded` = just the nutrient rows (no mascot header, no card), for use inside another card. `losing` lists the priority nutrients first. */
export function MicroCard({ date, embedded = false, losing = false }: { date?: string; embedded?: boolean; losing?: boolean }) {
  const { S, colors } = useThemedStyles();
  const day = date || today();
  const [d, setD] = useState<Micro | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => { try { setD(await read<Micro>(`/api/progress/micro?date=${day}`)); } catch { /* optional card */ } }, [day]);
  useEffect(() => { load(); }, [load]);
  useRefreshOnSync(() => load());
  if (!d) return embedded ? <Text style={S.muted}>Loading…</Text> : null;
  if (!d.ok && embedded) return <Text style={S.muted}>{d.note}</Text>;
  if (!d.ok) return <View style={S.card}><Text style={{ fontWeight: '800', color: colors.ink }}>Vitamins and minerals</Text><Text style={[S.muted, { marginTop: 4 }]}>{d.note}</Text></View>;
  const mood = d.mood || 'nodata';
  const rows = losing ? [...d.rows].sort((a, b) => (DEFICIT_FIRST.includes(a.id) ? 0 : 1) - (DEFICIT_FIRST.includes(b.id) ? 0 : 1)) : d.rows;
  return (
    <View style={embedded ? undefined : S.card} accessibilityLabel="Vitamins and minerals">
      {!embedded && <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Buddy scene={SCENE[mood]} size={72} label={HEAD[mood]} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>POWER-UPS</Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{HEAD[mood]}</Text>
          {!!d.knownCount && <Text style={S.muted}>{d.inRange} of {d.knownCount} tracked nutrients in range today.</Text>}
          {!!d.emptyNote && <Text style={S.muted}>{d.emptyNote}</Text>}
        </View>
      </View>}
      {embedded && !!d.knownCount && <Text style={S.muted}>{d.inRange} of {d.knownCount} tracked nutrients in range today.</Text>}
      {losing && <Text style={[S.muted, { marginTop: 4 }]}>★ = often runs short when eating less.</Text>}
      {rows.map((r) => {
        const low = r.status === 'low' ? d.low?.find((x) => x.id === r.id) : undefined;
        const pct = Math.min(100, r.pct || 0);
        return (
          <View key={r.id} style={{ marginTop: 10 }}>
            <TouchableOpacity disabled={!low} onPress={() => setOpen(open === r.id ? null : r.id)} accessibilityRole={low ? 'button' : 'text'} accessibilityLabel={r.status === 'nodata' ? `${r.label}, not enough data` : `${r.label}, ${r.value} ${r.unit}, ${r.status}`} style={{ minHeight: 32 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{losing && DEFICIT_FIRST.includes(r.id) ? '★ ' : ''}{r.label}</Text>
                <Text style={{ color: colors.muted }}>{r.status === 'nodata' ? 'Not enough data' : `${r.arrow} ${r.value} ${r.unit} (${r.range.min}${r.range.max ? `–${r.range.max}` : '+'})`}</Text>
              </View>
              {r.status !== 'nodata' && <View style={{ height: 8, borderRadius: 6, backgroundColor: colors.border, marginTop: 4, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: 8, backgroundColor: r.status === 'low' ? '#E0A030' : r.status === 'high' ? '#D9822B' : colors.primary }} /></View>}
            </TouchableOpacity>
            {low && open === r.id && <Text style={[S.muted, { marginTop: 4 }]}>{low.foods?.length ? `Try more of: ${low.foods.map((f) => (f.mine ? `${f.name} (you already log it)` : f.name)).join(', ')}.` : low.hint}</Text>}
          </View>
        );
      })}
      <Text style={[S.muted, { marginTop: 10, fontSize: 12 }]}>{d.note} Source: {d.source}.{d.rdaVerified === false ? ' Reference ranges still being verified.' : ''}</Text>
    </View>
  );
}

/** Closed by default: one quiet row under the macros. Tap to open the vitamins and minerals, tap again to close. */
export function MicroToggle({ date, losing = false }: { date?: string; losing?: boolean }) {
  const { S, colors } = useThemedStyles();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
      <TouchableOpacity onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="Vitamins and minerals" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 14 }}>Vitamins & minerals</Text>
        <Text style={{ color: colors.muted, fontSize: 16 }}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open && <MicroCard embedded date={date} losing={losing} />}
    </View>
  );
}
