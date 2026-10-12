// The frame around every page: a left sidebar on computers (logo + navigation) and a slim top bar
// (date / search pill, light-dark switch, profile). On phones the sidebar is hidden and the older top bar is used.
import "./skins.css";

const I = (d) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS = {
  home: I(<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />),
  food: I(<><path d="M7 3v7M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 10v11" /><path d="M17 21V3c-2.5 1.5-3.5 4.5-3.5 8H17" /></>),
  activity: I(<path d="M3 12h4l3-8 4 16 3-8h4" />),
  water: I(<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />),
  weight: I(<><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M8 10a4 4 0 0 1 8 0M12 10l2-2.5" /></>),
  habits: I(<path d="M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" />),
  tasks: I(<path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />),
  progress: I(<path d="M3 3v18h18M7 15l4-4 3 3 5-6" />),
  plan: I(<path d="M4 5h16v16H4zM4 10h16M9 3v4M15 3v4" />),
  profile: I(<><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></>),
  search: I(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>),
};

// [label, page key used by App.jsx, icon, other page keys that should light this item up]
const NAV = [
  ["Home", "dashboard", "home", []],
  ["Food Logs", "foodLogger", "food", ["food"]],
  ["Activities", "exercise", "activity", ["health"]],
  ["Water", "water", "water", []],
  ["Weight", "weight", "weight", []],
  ["Habits", "habit", "habits", []],
  ["Tasks", "task", "tasks", []],
  ["Progress", "progress", "progress", []],
  ["Plan", "planner", "plan", ["recipes"]],
  ["Profile", "profile", "profile", []],
];

export default function AppChrome({ page, goTo, brand, themeToggle, avatar, avatarTitle, dateText }) {
  return (
    <>
      <aside className="sb" aria-label="Main navigation">
        <button type="button" className="sb-logo" onClick={() => goTo("dashboard")} aria-label="FlexFit home">
          <span className="sb-mark">✦</span><span>FlexFit</span>
        </button>
        <nav>
          {NAV.map(([label, key, icon, alt]) => {
            const on = page === key || alt.includes(page);
            return (
              <button key={key} type="button" className={`sb-item${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined} onClick={() => goTo(key)}>
                {ICONS[icon]}<span>{label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <header className="topbar tb">
        {brand}
        <button type="button" className="tb-date" onClick={() => goTo("foodLogger")} aria-label="Search and log food">
          {ICONS.search}<span>{dateText}</span>
        </button>
        <div className="topbar-actions">
          {themeToggle}
          <button className="topbar-progress tb-mobile" onClick={() => goTo("planner")} aria-label="Open meal planner"><span>📅</span><span>Plan</span></button>
          <button className={`topbar-progress tb-mobile ${page === "progress" ? "active" : ""}`} onClick={() => goTo("progress")} aria-label="Open Progress and History"><span>📈</span><span>Progress</span></button>
          <div className="profile">
            <button className="profile-avatar" onClick={() => goTo("profile")} aria-label="Open profile" title={avatarTitle}>{avatar}</button>
          </div>
        </div>
      </header>
    </>
  );
}
