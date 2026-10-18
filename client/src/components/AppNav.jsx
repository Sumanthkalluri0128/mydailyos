// One navigation for the whole app: a grouped sidebar on desktop, a thumb-friendly tab bar + "More" sheet on phones.
// Every page that existed is still here; they are just grouped by what you are trying to do.
import { useEffect, useState } from "react";
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

export default function AppNav({ current, go, theme, onToggleTheme, avatar, name, streak, onAsk }) {
  const [more, setMore] = useState(false);
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
      {/* desktop sidebar */}
      <aside className="nv-side" aria-label="Main navigation">
        <button type="button" className="nv-brand" onClick={() => go("dashboard")} aria-label="FlexFit home">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="40" height="40" />
          <span><b>FlexFit</b><small>Eat. Move. Improve.</small></span>
        </button>
        <button type="button" className="nv-ask" onClick={() => onAsk?.()}><span>💬</span> Ask FlexFit <kbd>?</kbd></button>
        <nav>
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="nv-group">
              <div className="nv-title">{g.title}</div>
              {g.items.map(([id, icon, label, hint]) => (
                <button key={id} type="button" className={`nv-item ${is(id) ? "is-on" : ""}`} onClick={() => go(id)} aria-current={is(id) ? "page" : undefined} title={hint}>
                  <span className="nv-ic" aria-hidden="true">{icon}</span><span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="nv-foot">
          <button type="button" className={`nv-me ${current === "profile" ? "is-on" : ""}`} onClick={() => go("profile")} aria-label="Profile and settings">
            <span className="nv-avatar">{avatar}</span><span><b>{name || "Profile"}</b><small>Profile &amp; settings</small></span>
          </button>
          {flame}
          <button type="button" className="nv-theme" onClick={onToggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{theme === "dark" ? "☀️" : "🌙"}</button>
        </div>
      </aside>

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
          <button key={id} type="button" className={`nv-tab ${is(id) ? "is-on" : ""}`} onClick={() => go(id)} aria-current={is(id) ? "page" : undefined}><span aria-hidden="true">{icon}</span>{label}</button>
        ))}
        <button type="button" className={`nv-tab ${more ? "is-on" : ""}`} onClick={() => setMore(!more)} aria-expanded={more} aria-haspopup="dialog"><span aria-hidden="true">⋯</span>More</button>
      </nav>
      {more && (
        <div className="nv-sheet-wrap" onClick={() => setMore(false)}>
          <div className="nv-sheet" role="dialog" aria-label="All features" onClick={(e) => e.stopPropagation()}>
            <div className="nv-sheet-head"><b>Everything in FlexFit</b><button type="button" onClick={() => setMore(false)} aria-label="Close">✕</button></div>
            <button type="button" className="nv-ask" onClick={() => { setMore(false); onAsk?.(); }}><span>💬</span> Ask FlexFit anything</button>
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
