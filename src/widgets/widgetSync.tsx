// Called from the app (Home screen) whenever today's numbers change, so the home-screen widget updates straight away
// instead of waiting for Android's 30-minute refresh. Android only; every failure is swallowed (the widget is optional).
import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import FlexFitWidget from './FlexFitWidget';
import { WIDGET_NAME, clearWidgetSnapshot, saveWidgetSnapshot } from './widgetData';
import { buildSnapshot, type DaySnapshotInput } from '../utils/widgetSnapshot';
import { getWeeklyTheme } from './widgetTheme';

let lastKey = '';

export async function syncWidget(input: DaySnapshotInput): Promise<void> {
  if (Platform.OS !== 'android') return;
  const key = JSON.stringify(input);
  if (key === lastKey) return; // nothing changed
  lastKey = key;
  try {
    const who = await getWeeklyTheme();
    const snap = buildSnapshot({ ...input, who });
    await saveWidgetSnapshot(snap);
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: (info: any) => <FlexFitWidget who={who} state={{ kind: 'ok', snap }} size={{ w: Number(info?.width) || 0, h: Number(info?.height) || 0 }} />, widgetNotFound: () => {} });
  } catch { /* no widget on the home screen, or not a dev build: nothing to update */ }
}

/** On sign-out: forget the numbers and redraw the widget as "Sign in". */
export async function resetWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  lastKey = '';
  try {
    await clearWidgetSnapshot();
    const who = await getWeeklyTheme();
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: (info: any) => <FlexFitWidget who={who} state={{ kind: 'signedOut' }} size={{ w: Number(info?.width) || 0, h: Number(info?.height) || 0 }} />, widgetNotFound: () => {} });
  } catch { /* ignore */ }
}
