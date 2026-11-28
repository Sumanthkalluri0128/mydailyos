// Saves the weekly widget theme on the phone and hands it to every place that draws the widget (the headless widget task and the
// app's own syncWidget). The picking rules live in utils/widgetTheme.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveTheme, type ThemeState } from '../utils/widgetTheme';

const KEY = 'ff.widgetTheme';
let inFlight: Promise<string> | null = null; // the app and the widget task can ask at the same moment: only one of them may pick

/** This week's theme ("naruto", "goku", ...). Picks and saves a new one on the first call of a new week. Never throws. */
export function getWeeklyTheme(now = Date.now()): Promise<string> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let saved: ThemeState | null = null;
    try { const raw = await AsyncStorage.getItem(KEY); saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
    const next = resolveTheme(saved, now);
    if (!saved || next.week !== saved.week || next.who !== saved.who) {
      try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch { /* the pick just repeats for this draw */ }
    }
    return next.who;
  })().finally(() => { inFlight = null; });
  return inFlight;
}
