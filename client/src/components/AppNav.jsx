// One navigation for the whole app: a grouped sidebar on desktop, a thumb-friendly tab bar + "More" sheet on phones.
// Every page that existed is still here; they are just grouped by what you are trying to do.
import { useEffect, useRef, useState } from "react";
import "./appnav.css";

export const NAV_GROUPS = [
  { title: "Today", items: [["dashboard", "🏠", "Home", "Your day at a glance"]] },
  { title: "Eat", items: [
    ["foodLogger", "🍽️", "Log food", "Add what you ate"],
    ["planner", "📅", "Meal planner", "Plan the week from what you eat"],
    ["recipes", "🍲", "Recipes", "Cook once, eat by portion"],
    ["food", "🥗", "My foods", "Your food list and barcode items"],
  ] },
  { title: "Move & body", items: [
    ["water", "💧", "Water", "Hydration"],
    ["exercise", "🔥", "Exercise", "Workouts and steps"],
    ["weight", "⚖️", "Weight", "Weigh-ins and trend"],
    ["health", "❤️", "Health", "Sleep and measurements"],
  ] },
  { title: "Stay on track", items: [
    ["goals", "🏆", "Goals", "Quests, targets, your journey"],
    ["habit", "🔁", "Habits", "Daily routines and streaks"],
    ["task", "📋", "Tasks", "To-dos and reminders"],
    ["progress", "📈", "Progress", "History, charts, reports"],
  ] },
];
const TABS = [["dashboard", "🏠", "Home"], ["foodLogger", "🍽️", "Food"], ["planner", "📅", "Plan"], ["progress", "📈", "Progress"]];
const FOOD_PAGES = ["foodLogger", "food"];
const PILL = [["dashboard", "🏠", "Home"], ["foodLogger", "🍽️", "Log Food"], ["planner", "📅", "Meal Planner"], ["recipes", "🍲", "Recipes"], ["food", "🥗", "My Foods"]];
const PILL_IDS = PILL.map((p) => p[0]);

export default function AppNav({ current, go, theme, onToggleTheme, avatar, name, streak, onAsk }) {
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const moreRef = useRef(null);
  const moreOn = !PILL_IDS.includes(current) && current !== "profile";
  useEffect(() => { setMenu(false); }, [current]);
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMenu(false); };
    const esc = (e) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", off); window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); window.removeEventListener("keydown", esc); };
  }, [menu]);
  useEffect(() => { setMore(false); }, [current]);
  useEffect(() => {
    if (!more) return undefined;
    const esc = (e) => e.key === "Escape" && setMore(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [more]);
  const is = (id) => current === id || (id === "foodLogger" && FOOD_PAGES.includes(current)) || (id === "planner" && current === "recipes");
  const flame = streak?.current > 0 ? <span className="nv-streak" title="Logging streak">🔥 {streak.current}</span> : null;

  return (
    <>
      {/* desktop: floating top bar with a pill of the everyday pages and a "More" menu for the rest */}
      <header className="nv-bar" aria-label="Main navigation">
        <button type="button" className="nv-brand" onClick={() => go("dashboard")} aria-label="FlexFit home">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="44" height="44" />
          <span><b>FlexFit</b><small>Eat. Move. Improve.</small></span>
        </button>
        <nav className="nv-pill" aria-label="Pages">
          {PILL.map(([id, icon, label]) => (
            <button key={id} type="button" className={`nv-pi ${current === id ? "is-on" : ""}`} onClick={() => go(id)} aria-current={current === id ? "page" : undefined}><span aria-hidden="true">{icon}</span>{label}</button>
          ))}
          <div className="nv-more-wrap" ref={moreRef}>
            <button type="button" className={`nv-pi ${moreOn || menu ? "is-on" : ""}`} onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu"><span aria-hidden="true">⋯</span>More</button>
            {menu && (
              <div className="nv-menu" role="menu">
                {NAV_GROUPS.filter((g) => g.title !== "Today" && g.title !== "Eat").map((g) => (
                  <div key={g.title} className="nv-group">
                    <div className="nv-title">{g.title}</div>
                    {g.items.map(([id, icon, label, hint]) => (
                      <button key={id} type="button" role="menuitem" data-tour={`tab-${id}`} className={`nv-item ${is(id) ? "is-on" : ""}`} onClick={() => { setMenu(false); go(id); }}>
                        <span className="nv-ic" aria-hidden="true">{icon}</span><span><b>{label}</b><small>{hint}</small></span>
                      </button>
                    ))}
                  </div>
                ))}
                <button type="button" role="menuitem" className={`nv-item nv-prof ${current === "profile" ? "is-on" : ""}`} onClick={() => { setMenu(false); go("profile"); }}>
                  <span className="nv-ic" aria-hidden="true">⚙️</span><span><b>Profile &amp; settings</b><small>Targets, units, characters</small></span>
                </button>
              </div>
            )}
          </div>
        </nav>
        <div className="nv-right">
          <button type="button" className="nv-round" onClick={() => go("task")} aria-label="Tasks and reminders" title="Tasks and reminders">🔔</button>
          {flame}
          <button type="button" className="nv-round" onClick={onToggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title="Light / dark">{theme === "dark" ? "☀️" : "🌙"}</button>
          <button type="button" className={`nv-me ${current === "profile" ? "is-on" : ""}`} onClick={() => go("profile")} aria-label="Profile and settings"><span className="nv-avatar">{avatar}</span><span className="nv-chev" aria-hidden="true">⌄</span></button>
        </div>
      </header>

      {/* phone: slim header + bottom tabs */}
      <header className="nv-top">
        <button type="button" className="nv-brand" onClick={() => go("dashboard")} aria-label="FlexFit home">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="32" height="32" /><b>FlexFit</b>
        </button>
        <div className="nv-top-actions">
          {flame}
          <button type="button" className="nv-theme" onClick={onToggleTheme} aria-label="Toggle dark mode">{theme === "dark" ? "☀️" : "🌙"}</button>
          <button type="button" className="nv-avatar" onClick={() => go("profile")} aria-label="Profile">{avatar}</button>
        </div>
      </header>
      <nav className="nv-tabs" aria-label="Main navigation">
        {TABS.map(([id, icon, label]) => (
          <button key={id} type="button" data-tour={`tab-${id}`} className={`nv-tab ${is(id) ? "is-on" : ""}`} onClick={() => go(id)} aria-current={is(id) ? "page" : undefined}><span aria-hidden="true">{icon}</span>{label}</button>
        ))}
        <button type="button" className={`nv-tab ${more ? "is-on" : ""}`} onClick={() => setMore(!more)} aria-expanded={more} aria-haspopup="dialog"><span aria-hidden="true">⋯</span>More</button>
      </nav>
      {more && (
        <div className="nv-sheet-wrap" onClick={() => setMore(false)}>
          <div className="nv-sheet" role="dialog" aria-label="All features" onClick={(e) => e.stopPropagation()}>
            <div className="nv-sheet-head"><b>Everything in FlexFit</b><button type="button" onClick={() => setMore(false)} aria-label="Close">✕</button></div>
            {NAV_GROUPS.map((g) => (
              <div key={g.title} className="nv-group">
                <div className="nv-title">{g.title}</div>
                <div className="nv-grid">
                  {g.items.map(([id, icon, label, hint]) => (
                    <button key={id} type="button" className={`nv-tile ${is(id) ? "is-on" : ""}`} onClick={() => go(id)}><span aria-hidden="true">{icon}</span><b>{label}</b><small>{hint}</small></button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="nv-tile nv-wide" onClick={() => go("profile")}><span aria-hidden="true">⚙️</span><b>Profile &amp; settings</b><small>Targets, units, characters</small></button>
          </div>
        </div>
      )}
    </>
  );
}
