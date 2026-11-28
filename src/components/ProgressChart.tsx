import React, { useState } from 'react';
import { LayoutChangeEvent, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { shortDate } from '../utils/dates';
import { useTheme } from '../utils/theme';
import { WeightReveal, useWeightRevealed } from './WeightReveal';

type Point = { label: string; value: number; date?: string; note?: string };
type Props = {
  title: string; unit?: string; data: Point[]; height?: number; emptyText?: string;
  target?: number | null;     // dashed goal line
  /** Body-weight chart: every value label is hidden until the person taps to reveal (WeightReveal). */
  weightValues?: boolean;
  kind?: 'auto' | 'bar' | 'line';
  /** Line charts only: the individual readings, drawn as faint dots behind `data` (e.g. daily weigh-ins behind a 7-day trend). */
  raw?: Point[];
};

const DAY_MS = 86400000;
const dayNum = (d?: string) => { const [y, m, dd] = String(d || '').split('-').map(Number); return y && m && dd ? Math.round(Date.UTC(y, m - 1, dd) / DAY_MS) : NaN; };

const PAD = { l: 40, r: 10, t: 12, b: 22 };
const compact = (n: number) => (Math.abs(n) >= 10000 ? `${Math.round(n / 1000)}k` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n * 10) / 10));
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** Bar chart for daily totals (calories, water...), line chart for trends (weight / long ranges). Tap a point for its exact value. */
export function ProgressChart({ title, unit = '', data, height = 190, emptyText = 'No data for this period.', target, kind = 'auto', raw, weightValues = false }: Props) {
  const { colors: c } = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  data = data.filter((x) => Number.isFinite(Number(x.value))); // a NaN would break the whole SVG path
  const values = data.map((x) => Number(x.value)).filter(Number.isFinite);
  const hasData = values.length > 0 && values.some((v) => v !== 0);
  const mode = kind === 'auto' ? (data.length > 31 ? 'line' : 'bar') : kind;
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));

  const iw = Math.max(0, w - PAD.l - PAD.r);
  const ih = height - PAD.t - PAD.b;
  const rawVals = (mode === 'line' && raw ? raw : []).map((x) => Number(x.value)).filter(Number.isFinite);
  const allVals = [...values, ...rawVals];
  // The goal line only stretches the axis when it is reasonably near the data (a 70 kg goal shouldn't flatten a 95 kg trend).
  const spanGuess = Math.max(...allVals) - Math.min(...allVals);
  const useTarget = !!target && (mode === 'bar' || Math.abs((target as number) - (allVals.reduce((a, b) => a + b, 0) / (allVals.length || 1))) <= Math.max(spanGuess * 3, 5));
  const dataMax = Math.max(...allVals, useTarget ? (target as number) : 0, 0);
  const dataMin = Math.min(...allVals, useTarget && mode === 'line' ? (target as number) : Infinity);
  // Bars always start at zero (honest); lines zoom in on the range so small weight changes are visible.
  const pad = Math.max((dataMax - dataMin) * 0.15, mode === 'line' ? 0.5 : 0);
  const lo = mode === 'bar' ? 0 : dataMin - pad;
  const hi = mode === 'bar' ? niceMax(dataMax) : dataMax + pad;
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const slot = data.length ? iw / data.length : 0;
  const barW = Math.max(3, Math.min(28, slot * 0.62));
  const bx = (i: number) => PAD.l + slot * i + slot / 2;
  // Line charts place points by their real date, so a 10-day gap between weigh-ins looks like a 10-day gap (not the next point).
  const days = data.map((p) => dayNum(p.date || p.label));
  const dated = mode === 'line' && data.length > 1 && days.every(Number.isFinite);
  const d0 = dated ? Math.min(...days, ...(raw || []).map((r) => dayNum(r.date)).filter(Number.isFinite)) : 0;
  const d1 = dated ? Math.max(...days, ...(raw || []).map((r) => dayNum(r.date)).filter(Number.isFinite)) : 0;
  const xOfDay = (dn: number) => PAD.l + 8 + ((dn - d0) / Math.max(1, d1 - d0)) * Math.max(0, iw - 16);
  const x = (i: number) => (dated ? xOfDay(days[i]) : bx(i));
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const active = sel !== null && data[sel] ? data[sel] : null;
  const decimals = values.some((v) => Math.abs(v % 1) > 0) ? 1 : 0;
  const fmt = (v: number) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: decimals })}${unit}`;
  const wr = useWeightRevealed();
  const masked = weightValues && !wr;
  const shown = (v: number) => (masked ? '•••' : fmt(v));
  const labelIdx = data.length <= 1 ? [0] : Array.from(new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]));

  return (
    <View style={{ backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 20, padding: 16, marginBottom: 14, elevation: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>{title}</Text>
        {hasData && (weightValues ? <WeightReveal compact prefix="avg " text={fmt(avg)} style={{ fontSize: 12, color: c.muted }} /> : <Text style={{ fontSize: 12, color: c.muted }}>avg {fmt(avg)}</Text>)}
      </View>
      {hasData && (
        <Text style={{ fontSize: 12, color: active ? c.primary : c.muted, fontWeight: active ? '800' : '400', marginBottom: 6, minHeight: 16 }}>
          {active ? `${shortDate(active.date || active.label)} · ${shown(active.value)}${active.note ? ` · ${active.note}` : ''}` : (weightValues ? 'Tap a point, then tap the weight to show it' : 'Tap a point to see its value')}
        </Text>
      )}

      {!hasData ? (
        <View style={{ height, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.muted, fontSize: 13 }}>{emptyText}</Text></View>
      ) : (
        <View onLayout={onLayout} style={{ height }}>
          {w > 0 && (
            <Svg width={w} height={height}>
              {ticks.map((t, i) => (
                <React.Fragment key={i}>
                  <Line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke={c.border} strokeWidth={1} />
                  <SvgText x={PAD.l - 6} y={y(t) + 3.5} fontSize={10} fill={c.muted} textAnchor="end">{masked ? '' : compact(t)}</SvgText>
                </React.Fragment>
              ))}
              {useTarget && !!target && target >= lo && target <= hi && (
                <>
                  <Line x1={PAD.l} x2={w - PAD.r} y1={y(target)} y2={y(target)} stroke="#20A46B" strokeWidth={1.5} strokeDasharray="5 4" />
                  <SvgText x={w - PAD.r - 2} y={y(target) - 4} fontSize={12} fontWeight="700" fill="#177a4f" textAnchor="end">Goal {shown(target)}</SvgText>
                </>
              )}
              {mode === 'bar' ? data.map((p, i) => {
                const h = Math.max(p.value > 0 ? 2 : 0, ((Number(p.value) - lo) / (hi - lo || 1)) * ih);
                return <Rect key={i} x={bx(i) - barW / 2} y={PAD.t + ih - h} width={barW} height={h} rx={Math.min(5, barW / 2)} fill={c.primary} opacity={sel === null || sel === i ? 1 : 0.35} />;
              }) : (
                <>
                  {(raw || []).map((p, i) => { const dn = dayNum(p.date || p.label); return Number.isFinite(dn) && dated ? <Circle key={`r${i}`} cx={xOfDay(dn)} cy={y(Number(p.value))} r={2.6} fill={c.muted} opacity={0.45} /> : null; })}
                  {data.map((p, i) => (p.note ? <Circle key={`n${i}`} cx={x(i)} cy={y(Number(p.value))} r={7} fill="none" stroke={c.primary} strokeWidth={1.8} /> : null))}
                  <Path d={data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(Number(p.value)).toFixed(1)}`).join(' ')} stroke={c.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                  {data.length <= 60 && data.map((p, i) => <Circle key={i} cx={x(i)} cy={y(Number(p.value))} r={sel === i ? 5 : 3.5} fill={c.primary} stroke={c.card} strokeWidth={1.5} />)}
                </>
              )}
              {labelIdx.map((i) => (
                <SvgText key={i} x={mode === 'bar' ? bx(i) : x(i)} y={height - 5} fontSize={10} fill={c.muted} textAnchor={i === 0 && data.length > 1 ? 'start' : i === data.length - 1 && data.length > 1 ? 'end' : 'middle'}>
                  {shortDate(data[i].date || data[i].label)}
                </SvgText>
              ))}
            </Svg>
          )}
          {/* Invisible tap targets, one per point */}
          {dated ? (
            // Dated lines: tapping anywhere selects the nearest point.
            <TouchableOpacity activeOpacity={1} style={{ position: 'absolute', left: PAD.l, right: PAD.r, top: 0, bottom: 0 }}
              onPress={(e) => { const px = e.nativeEvent.locationX + PAD.l; let best = 0; for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; setSel(sel === best ? null : best); }}
              accessibilityLabel={`${title}. Tap to read a value.`} />
          ) : (
            <View style={{ position: 'absolute', left: PAD.l, right: PAD.r, top: 0, bottom: 0, flexDirection: 'row' }}>
              {data.map((_, i) => (
                <TouchableOpacity key={i} activeOpacity={1} onPress={() => setSel(sel === i ? null : i)} style={{ flex: 1 }} accessibilityLabel={`${data[i].label} ${shown(data[i].value)}`} />
              ))}
            </View>
          )}
        </View>
      )}
      {hasData && useTarget && !!target && <Text style={{ fontSize: 12, color: c.muted, marginTop: 6 }}>Dashed line = your target ({shown(target)})</Text>}
    </View>
  );
}
