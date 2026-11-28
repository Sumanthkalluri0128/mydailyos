import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme as useSystemColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Scheme = 'light' | 'dark';

const MODE_KEY = 'mydailyos_theme_mode_v1';

export const lightColors = {
  primary: '#6847E8',
  primarySolid: '#6847E8', // background behind white text (>= 4.5:1). Same as primary in light mode
  dangerSolid: '#B83232',
  primarySoft: '#EEE9FF',
  ink: '#1D1D25',
  muted: '#666675', // 5.6:1 on the page background (the old grey was 3.6:1, below the 4.5:1 reading standard)
  bg: '#F6F5FB',
  card: '#FFFFFF',
  raised: '#FFFFFF',
  border: '#E1E1E8',
  success: '#20A46B',
  danger: '#B83232', // was #D64545: too close to the green in lightness for colour-blind viewers (see tools/a11y-check.js)
  chipBg: '#F0EFF5',
  overlay: 'rgba(15,18,35,0.42)',
  // Semantic tokens: tinted panels, banners and the hero card — so nothing needs a hard-coded pastel.
  hero: '#6847E8',
  successSoft: '#E6F6EE',
  successInk: '#157A4E',
  dangerSoft: '#FDECEC',
  dangerInk: '#B3261E',
  warnSoft: '#FFF6E5',
  warnBorder: '#F0C36A',
  warnInk: '#8A5A00',
  cardBorder: 'transparent',
  cardBorderWidth: 0,
  // One colour per metric, used the same way on every screen.
  kcal: '#d9722b',
  protein: '#20A46B',
  water: '#2587D9',
  steps: '#14A38B',
  shadow: '#1B1340',
};

// Dark palette: layered surfaces (bg < card < raised) with a visible hairline edge — drop shadows don't show on dark
// backgrounds, so borders carry the separation. Text colours were chosen for >= 4.5:1 contrast on their surface.
export const darkColors: typeof lightColors = {
  primary: '#7F6CF6',
  primarySolid: '#6A55E8',
  dangerSolid: '#C62F32',
  primarySoft: '#272243',
  ink: '#EDEDF5',
  muted: '#9C9CB0',
  bg: '#0C0C13',
  card: '#16161F',
  raised: '#1F1F2B',
  border: '#2B2B3A',
  success: '#5BE0A4',
  danger: '#E85A5A',
  chipBg: '#20202C',
  overlay: 'rgba(0,0,0,0.65)',
  hero: '#5B48D9',
  successSoft: '#12261E',
  successInk: '#5BE0A4',
  dangerSoft: '#2E1819',
  dangerInk: '#FF9494',
  warnSoft: '#2B2412',
  warnBorder: '#6B5320',
  warnInk: '#F2C265',
  cardBorder: '#262634',
  cardBorderWidth: 1,
  kcal: '#F59A55',
  protein: '#3ECF8E',
  water: '#5AB0FF',
  steps: '#35D0B5',
  shadow: '#000000',
};

export type ThemeColors = typeof lightColors;

/** Shape tokens, so every screen rounds, spaces and lifts things the same way. */
export const radius = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
/** Soft, tinted elevation (iOS shadow + Android elevation). Dark mode relies on borders instead, so the shadow is faint. */
export const lift = (c: ThemeColors, level: 1 | 2 = 1) => ({
  shadowColor: c.shadow, shadowOpacity: c.cardBorderWidth ? 0.25 : level === 2 ? 0.12 : 0.07,
  shadowRadius: level === 2 ? 22 : 14, shadowOffset: { width: 0, height: level === 2 ? 10 : 6 }, elevation: level === 2 ? 4 : 2,
});

type ThemeCtx = {
  mode: ThemeMode;
  scheme: Scheme;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((raw) => {
        if (raw === 'light' || raw === 'dark' || raw === 'system') setModeState(raw);
      })
      .finally(() => setLoaded(true));
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
  };

  const scheme: Scheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo<ThemeCtx>(
    () => ({ mode, scheme, colors, isDark: scheme === 'dark', setMode }),
    [mode, scheme]
  );

  // Avoid a flash of the wrong theme before AsyncStorage resolves.
  if (!loaded) return null;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback so a screen never crashes if it's ever rendered outside the
    // provider (e.g. during fast refresh) — just resolves to system/light.
    const scheme: Scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
    const colors = scheme === 'dark' ? darkColors : lightColors;
    return { mode: 'system', scheme, colors, isDark: scheme === 'dark', setMode: () => {} };
  }
  return ctx;
}
