import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import FlexFitWidget from './FlexFitWidget';
import { WIDGET_NAME, addWaterFromWidget, loadWidgetSnapshot, loadWidgetState } from './widgetData';
import { snapshotIsStale } from '../utils/widgetSnapshot';
import { getWeeklyTheme } from './widgetTheme';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== WIDGET_NAME) return;
  // the real widget size (dp) lets the layout keep every number inside its slot of the artwork
  const size = { w: Number(props.widgetInfo.width) || 0, h: Number(props.widgetInfo.height) || 0 };
  // this week's artwork: picked once per week, then the same on every redraw (a new week picks a theme not shown yet)
  const who = await getWeeklyTheme();
  const draw = (state: Parameters<typeof FlexFitWidget>[0]['state']) => props.renderWidget(<FlexFitWidget state={state} size={size} who={who} />);

  try {
    switch (props.widgetAction) {
      case 'WIDGET_RESIZED':
        // a resize only needs a redraw: use what is on the phone, no network wait
        draw(await loadWidgetState({ cacheOnly: true }));
        break;

      case 'WIDGET_ADDED':
      case 'WIDGET_UPDATE': {
        // paint today's last numbers straight away, then replace them with fresh ones
        const cached = await loadWidgetSnapshot();
        if (cached && !snapshotIsStale(cached)) draw({ kind: 'ok', snap: cached });
        draw(await loadWidgetState());
        break;
      }

      case 'WIDGET_CLICK':
        if (props.clickAction === 'ADD_WATER') {
          const saved = await addWaterFromWidget();
          const state = await loadWidgetState({ force: true });
          draw(state.kind === 'ok' && !saved ? { ...state, note: "Couldn't save water — you're offline" } : state);
        }
        break;

      case 'WIDGET_DELETED':
      default:
        break;
    }
  } catch {
    // never leave the widget blank because of a hiccup: fall back to what is on the phone
    try { draw(await loadWidgetState({ cacheOnly: true })); } catch { /* nothing more we can do */ }
  }
}
