import React from 'react';
// The library's entry point needs react-native (native modules); its widget primitives and tree builder are plain JS, so load just those.
jest.mock('react-native-android-widget', () => ({
  FlexWidget: require('react-native-android-widget/lib/commonjs/widgets/FlexWidget').FlexWidget,
  TextWidget: require('react-native-android-widget/lib/commonjs/widgets/TextWidget').TextWidget,
  ImageWidget: require('react-native-android-widget/lib/commonjs/widgets/ImageWidget').ImageWidget,
  OverlapWidget: require('react-native-android-widget/lib/commonjs/widgets/OverlapWidget').OverlapWidget,
}));
// the daily jpg backgrounds are bundled by Metro; Jest only needs a stand-in
jest.mock('../widgetBackgrounds', () => ({ BG_IMAGES: {}, bgFor: () => 1 }));
import FlexFitWidget from '../FlexFitWidget';
import { ZONES, zonesFor } from '../widgetZones';
import { buildSnapshot } from '../../utils/widgetSnapshot';
// the library's own tree builder: the same call the Android side makes, so a layout it cannot draw fails here instead of on a phone
const { buildWidgetTree } = require('react-native-android-widget/lib/commonjs/api/build-widget-tree');

const texts = (t: any): string[] => (t?.props?.text ? [t.props.text] : []).concat(...(t?.children || []).map(texts));
const click = (t: any): string[] => (t?.props?.clickAction ? [t.props.clickAction] : []).concat(...(t?.children || []).map(click));
const SIZE = { w: 320, h: 160 };
const NOW = new Date(2026, 9, 28, 12).getTime(); // Wed 28 Oct 2026

const day = (extra: any = {}) => buildSnapshot({
  calorieTarget: 2000, eaten: 500, waterMl: 1500, waterTargetMl: 3000, protein: 92, proteinTarget: 140, steps: 6420, stepsTarget: 10000, streak: 5, ...extra,
}, NOW);

describe('FlexFitWidget themed layout', () => {
  it('shows the real numbers (not just labels): date, calories, protein, steps, water, streak', () => {
    const tree = buildWidgetTree(<FlexFitWidget size={SIZE} state={{ kind: 'ok', snap: day() }} />);
    expect(texts(tree)).toEqual(expect.arrayContaining(['WED, OCT 28', '1,500', 'left', '92', '/140 g', '6,420', '/10k', '1,500', 'ml', '5 DAYS']));
  });
  it('is tappable: whole widget opens the app, the water drops add a glass', () => {
    const tree = buildWidgetTree(<FlexFitWidget size={SIZE} state={{ kind: 'ok', snap: day() }} />);
    expect(click(tree)).toEqual(expect.arrayContaining(['OPEN_APP', 'ADD_WATER']));
  });
  it('a finished mission gets a tick; unfinished ones do not', () => {
    const t = texts(buildWidgetTree(<FlexFitWidget size={SIZE} state={{ kind: 'ok', snap: day({ protein: 150, waterMl: 500 }) }} />));
    expect(t.filter((x) => x === '✓').length).toBe(2); // protein done + calories in budget
    expect(t).toEqual(expect.arrayContaining(['Protein', '10k steps', 'Budget', 'Water']));
  });
  it('over budget says "over"; gentle mode never shows a calorie number', () => {
    expect(texts(buildWidgetTree(<FlexFitWidget size={SIZE} state={{ kind: 'ok', snap: day({ eaten: 3380, calorieTarget: 1700 }) }} />))).toEqual(expect.arrayContaining(['1,680', 'over']));
    const g = texts(buildWidgetTree(<FlexFitWidget size={SIZE} state={{ kind: 'ok', snap: day({ gentle: true }) }} />));
    expect(g).toContain('Eating well'); expect(g).not.toContain('Budget'); expect(g).not.toContain('left');
  });
  it('builds for every state and a range of widget sizes', () => {
    const states: any[] = [
      { kind: 'signedOut' }, { kind: 'offline' },
      { kind: 'ok', snap: buildSnapshot({}, NOW), note: 'Offline · last update' },
      { kind: 'ok', snap: day({ eaten: 1700, calorieTarget: 1500, waterMl: 4000 }) },
      { kind: 'ok', snap: day({ streak: null, steps: null }) },
      { kind: 'ok', snap: day({ streak: 0 }) },
    ];
    for (const state of states) for (const size of [undefined, { w: 250, h: 125 }, { w: 400, h: 400 }, { w: 0, h: 0 }]) {
      expect(() => buildWidgetTree(<FlexFitWidget state={state} size={size as any} />)).not.toThrow();
    }
  });
  it('signed-out and offline states ask the person to open the app, with no stats', () => {
    expect(texts(buildWidgetTree(<FlexFitWidget state={{ kind: 'signedOut' }} />))).toContain('Sign in to FlexFit');
    expect(texts(buildWidgetTree(<FlexFitWidget state={{ kind: 'offline' }} />))).toContain("Can't reach FlexFit");
  });
});

describe('widget zones', () => {
  it('every daily background has zones, and Monday (zoro) falls back to jinwoo', () => {
    for (const who of ['naruto', 'luffy', 'goku', 'tanjiro', 'gojo', 'asta', 'jinwoo']) expect(ZONES[who]).toBeTruthy();
    expect(zonesFor('zoro')).toBe(ZONES.jinwoo);
  });
  it('each zone sits inside the 1774 x 887 artwork', () => {
    for (const z of Object.values(ZONES)) {
      const boxes = [z.today, z.streak, z.cal, z.calBar, z.pro, z.proBar, z.steps, z.stepsBar, z.water, ...z.missions];
      for (const [x, y, w, h] of boxes) { expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(x + w).toBeLessThanOrEqual(1774); expect(y + h).toBeLessThanOrEqual(887); }
      expect(z.dropsCx.length).toBe(7);
    }
  });
});
