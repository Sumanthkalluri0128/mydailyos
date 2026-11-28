// Weekly widget theme: each week the home-screen widget gets ONE of the 7 artworks, picked at random, and a theme is never
// repeated until all 7 have been shown (then the cycle starts again). Pure: no React Native imports, so it is unit-tested.
// The state ({ week, who, used }) is saved on the phone by src/widgets/widgetTheme.ts, so every redraw in a week shows the same art.

/** The 7 artworks in assets/widget (bg-<who>.jpg). */
export const WIDGET_THEMES = ['naruto', 'luffy', 'goku', 'tanjiro', 'gojo', 'asta', 'jinwoo'] as const;

export type ThemeState = {
  week: string;     // the Monday that starts the week this theme is for, "YYYY-MM-DD" (local time)
  who: string;      // this week's theme
  used: string[];   // themes already shown in the current cycle (includes `who`)
};

const p2 = (x: number) => (x < 10 ? `0${x}` : String(x));

/** The Monday (local time) of the week containing `ms`, as "YYYY-MM-DD". Weeks run Monday to Sunday. */
export function weekKey(ms = Date.now()): string {
  const d = new Date(ms);
  const back = (d.getDay() + 6) % 7; // Mon 0 ... Sun 6
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  return `${m.getFullYear()}-${p2(m.getMonth() + 1)}-${p2(m.getDate())}`;
}

const valid = (s: any): s is ThemeState =>
  !!s && typeof s.week === 'string' && typeof s.who === 'string' && (WIDGET_THEMES as readonly string[]).includes(s.who) && Array.isArray(s.used);

/**
 * The theme state for the week containing `now`.
 *  - same week as the saved state  -> unchanged (the widget keeps its art all week)
 *  - a new week                    -> a random theme that is NOT in `used`; when all 7 are used, a new cycle begins
 *                                     (and never starts with the theme that just ended, so no back-to-back repeat)
 *  - nothing saved / unreadable    -> a random theme, first of a new cycle
 * `rand` is injectable for tests (returns [0, 1)).
 */
export function resolveTheme(saved: ThemeState | null | undefined, now = Date.now(), rand: () => number = Math.random): ThemeState {
  const week = weekKey(now);
  const ok = valid(saved) ? saved : null;
  if (ok && ok.week === week) return ok;
  // clock moved back before the saved week: keep what we have rather than burning a theme
  if (ok && ok.week > week) return ok;

  let used = ok ? ok.used.filter((t) => (WIDGET_THEMES as readonly string[]).includes(t)) : [];
  let pool = WIDGET_THEMES.filter((t) => !used.includes(t));
  if (pool.length === 0) {
    used = [];
    pool = WIDGET_THEMES.filter((t) => t !== ok?.who);
  }
  const who = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  return { week, who, used: [...used, who] };
}
