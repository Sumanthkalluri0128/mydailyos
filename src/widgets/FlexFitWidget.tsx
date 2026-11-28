// The Android home-screen widget. It is drawn by the OS (not React Native), so it only supports the react-native-android-widget
// primitives and no hooks.
//
// THEMED LAYOUT: the widget wears one artwork per WEEK (assets/widget/bg-<who>.jpg), chosen at random without repeats (widgetTheme.ts). The artwork already
// contains the cards, icons and empty slots; this file only draws the LIVE numbers on top, at the places listed in widgetZones.ts.
// Positions are stored in pixels of the original 1774x887 art and scaled to the widget's real size, so the numbers stay in their slots
// when the widget is resized (the art is centred and never stretched).
//
// How an element is placed: every element sits in its own full-size layer of an OverlapWidget (layers stack), and is moved into place
// with marginLeft / marginTop. That uses only layout features every widget supports (no absolute positioning).
"use no memo";
import React from 'react';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';
import type { WidgetState } from './widgetData';
import { bgFor } from './widgetBackgrounds';
import { ART_H, ART_W, zonesFor, type Box } from './widgetZones';
import { dayWho } from '../utils/widgetSnapshot';

export type WidgetSize = { w: number; h: number };
export const DEFAULT_SIZE: WidgetSize = { w: 320, h: 160 }; // dp; used until Android tells us the real size

const LETTERBOX: ColorProp = '#0B0E16';
const TRACK: ColorProp = '#121722';
const COVER: ColorProp = '#0F131D';
const STREAK_COVER: ColorProp = '#14090C';
const WHITE: ColorProp = '#FFFFFF';
const MUTED: ColorProp = '#AEB7C8';
const CAL: ColorProp = '#F87171';
const OVER: ColorProp = '#FF6B6B';
const PRO: ColorProp = '#A78BFA';
const STEPS: ColorProp = '#4ADE80';
const WATER: ColorProp = '#38BDF8';
const FLAME: ColorProp = '#FDBA74';
const DATE: ColorProp = '#7DD3FC';
const DONE: ColorProp = '#22C55E';

// `who` is this week's theme (see widgetTheme.ts). Without it the snapshot's own theme (or the day's character) is used.
export default function FlexFitWidget({ state, size, who: weekWho }: { state: WidgetState; size?: WidgetSize; who?: string }) {
  const sw = size && size.w > 50 ? size.w : DEFAULT_SIZE.w;
  const sh = size && size.h > 30 ? size.h : DEFAULT_SIZE.h;
  const sc = Math.min(sw / ART_W, sh / ART_H);          // dp per art pixel
  const cw = Math.round(ART_W * sc), ch = Math.round(ART_H * sc);
  const px = (v: number) => Math.round(v * sc);
  const who = weekWho || (state.kind === 'ok' ? state.snap.who : dayWho());
  const z = zonesFor(who);
  const layers: React.ReactElement[] = [];

  // One element, moved to [x, y] (art pixels) inside its own full-size layer. `click` makes just that element tappable.
  const put = (key: string, b: Box, child: React.ReactNode, style: Record<string, any> = {}, click?: string, label?: string) => {
    layers.push(
      <FlexWidget key={key} style={{ width: cw, height: ch, flexDirection: 'column' }}>
        <FlexWidget
          {...(click ? { clickAction: click as any, accessibilityLabel: label } : {})}
          style={{ marginLeft: px(b[0]), marginTop: px(b[1]), width: Math.max(1, px(b[2])), height: Math.max(1, px(b[3])), ...style }}
        >
          {child}
        </FlexWidget>
      </FlexWidget>,
    );
  };

  // (Several elements side by side are passed as an ARRAY, never as a <>fragment</>: the widget library's tree builder flattens arrays but cannot draw fragments.)
  const text = (t: string, fs: number, color: ColorProp, bold = false, extra: Record<string, any> = {}, key?: string) => (
    <TextWidget key={key} text={t} maxLines={1} style={{ color, fontSize: fs, fontWeight: bold ? 'bold' : 'normal', ...extra }} />
  );

  // a number with a small unit next to it, left-aligned and vertically centred in its slot
  const value = (key: string, b: Box, v: string, unit: string, color: ColorProp, scale = 1) => {
    const fs = Math.max(8, Math.round(px(50) * scale));
    put(key, b, [
      text(v, fs, color, true, {}, 'v'),
      unit ? text(unit, Math.max(7, Math.round(fs * 0.75)), MUTED, false, { marginLeft: 2 }, 'u') : null,
    ], { flexDirection: 'row', alignItems: 'center' });
  };

  // The artwork has a sample bar painted in each card; cover it with a clean track, then draw the real fill.
  const bar = (key: string, b: Box, pct: number | null, color: ColorProp) => {
    const bw = px(b[2] + 6), bh = Math.max(4, px(b[3] + 6));
    const p = pct === null ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
    const fw = p === 0 ? 0 : Math.max(bh, Math.round((bw * p) / 100));
    put(key, [b[0] - 3, b[1] - 3, b[2] + 6, b[3] + 6], (
      fw > 0 ? <FlexWidget style={{ width: Math.min(bw, fw), height: bh, borderRadius: bh / 2, backgroundColor: color }} /> : null
    ), { backgroundColor: TRACK, borderRadius: bh / 2, flexDirection: 'row', overflow: 'hidden' });
  };

  if (state.kind === 'ok') {
    const s = state.snap;
    // date
    put('date', z.today, text(s.dateLabel, Math.max(8, px(40)), DATE, true), { justifyContent: 'center' });
    // streak: a dark patch hides the four empty hexagons, then the streak sits on top
    const sFs = Math.max(8, px(s.streakText.length > 7 ? 34 : 42));
    put('streak', z.streak, text(s.streakText, sFs, FLAME, true), { backgroundColor: STREAK_COVER, borderRadius: 4, justifyContent: 'center', alignItems: 'center' });
    // calories (gentle mode / hidden numbers: a kind message and an empty bar, never a number)
    value('calv', z.cal, s.caloriesValue, s.hidden ? '' : s.over ? 'over' : s.caloriesValue === '—' ? '' : 'left', s.over ? OVER : WHITE, s.hidden ? 0.8 : 1);
    bar('calb', z.calBar, s.caloriesPct, s.over ? OVER : CAL);
    // protein, steps, water
    value('prov', z.pro, s.proteinValue, s.proteinGoal.startsWith('/') ? s.proteinGoal.replace('/ ', '/') : '', WHITE);
    bar('prob', z.proBar, s.proteinPct, PRO);
    value('stepv', z.steps, s.stepsValue, s.stepsGoal ? s.stepsGoal.replace('/ ', '/') : '', WHITE);
    bar('stepb', z.stepsBar, s.stepsPct, STEPS);
    value('watv', z.water, s.waterValue, s.waterGoal.endsWith('fl oz') ? 'fl oz' : 'ml', WHITE);

    // water drops: the artwork has 7 empty drops; fill as many as the day's water goal is done. Tapping them adds a glass.
    const dropsN = z.dropsCx.length;
    const filled = s.waterPct === null ? 0 : Math.min(dropsN, Math.round((s.waterPct / 100) * dropsN));
    const gap = (z.dropsCx[dropsN - 1] - z.dropsCx[0]) / (dropsN - 1);
    const dropW = px(gap), dropH = px(46), dropFs = Math.max(8, px(40));
    const drops: React.ReactElement[] = [];
    for (let i = 0; i < dropsN; i++) {
      drops.push(
        <FlexWidget key={`d${i}`} style={{ width: dropW, height: dropH, justifyContent: 'center', alignItems: 'center' }}>
          {i < filled ? <TextWidget text="💧" maxLines={1} style={{ color: WATER, fontSize: dropFs }} /> : null}
        </FlexWidget>,
      );
    }
    put('drops', [z.dropsCx[0] - gap / 2, z.dropsCy - 23, gap * dropsN, 46], drops, { flexDirection: 'row' }, 'ADD_WATER', `Add ${s.addWaterLabel} of water`);

    // missions: the pill's checkbox turns green when it is done
    const keys = ['protein', 'steps', 'calories', 'water'] as const;
    keys.forEach((k, i) => {
      const [mx, my, mw, mh] = z.missions[i];
      const done = s.missions[k] === true;
      const known = s.missions[k] !== null;
      const boxPx = 34, cy = my + mh / 2;
      if (known && done) {
        put(`mt${i}`, [mx + 17, cy - boxPx / 2 - 1, boxPx, boxPx], text('✓', Math.max(8, px(34)), '#06280F', true),
          { backgroundColor: DONE, borderRadius: 3, justifyContent: 'center', alignItems: 'center' });
      }
      if (known) {
        put(`ml${i}`, [mx + 62, my + 6, mw - 70, mh - 12], text(s.missionLabels[k], Math.max(8, px(40)), done ? '#BBF7D0' : WHITE, done),
          { justifyContent: 'center' });
      }
    });
    if (state.note) put('note', [z.today[0], z.today[1] + z.today[3] + 6, 420, 36], text(state.note, Math.max(8, px(32)), '#86EFAC'), { justifyContent: 'center' });
  } else {
    const signedOut = state.kind === 'signedOut';
    put('msg', [560, 215, 1190, 440], [
      text(signedOut ? 'Sign in to FlexFit' : "Can't reach FlexFit", Math.max(12, px(64)), WHITE, true, {}, 'h'),
      <TextWidget
        key="b"
        text={signedOut ? 'Open the app to see your calories, protein, steps and water here.' : "Tap to open the app. This will refresh when you're back online."}
        maxLines={2} style={{ color: MUTED, fontSize: Math.max(9, px(44)), marginTop: 4 }}
      />,
    ], { backgroundColor: COVER, borderRadius: 14, padding: 10, flexDirection: 'column', justifyContent: 'center' });
  }

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Open FlexFit"
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: LETTERBOX, justifyContent: 'center', alignItems: 'center' }}
    >
      <OverlapWidget style={{ width: cw, height: ch, borderRadius: Math.max(8, px(40)), overflow: 'hidden' }}>
        <ImageWidget image={bgFor(who)} imageWidth={cw} imageHeight={ch} />
        {layers}
      </OverlapWidget>
    </FlexWidget>
  );
}
