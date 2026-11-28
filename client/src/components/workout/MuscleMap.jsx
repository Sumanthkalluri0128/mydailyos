// The body pictures: which muscles a day (or the whole week) trains, shown with the muscle image library (public/muscles, red = main muscle, orange = helper).
// Which picture fits a day, and the exercise-to-muscle rules, live in utils/muscleMap.js (shared with the phone); this file is only the screen.
import { useMemo, useState } from "react";
import { GROUP_LABEL, dayExercises, groupsOf, imagesFor, summaryLine, weekImages, weekTally } from "../../utils/muscleMap";

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One picture from the library, by its file name. */
export function MusclePic({ file, label, className = "" }) {
  return <img className={`mm-pic ${className}`} src={`/muscles/${file}.webp`} alt={label} loading="lazy" decoding="async" draggable="false" />;
}

/** What a day trains as pictures: the best-fitting one big, the rest of the main muscles smaller under it. */
export function DayPictures({ tally, label }) {
  const pics = useMemo(() => imagesFor(tally), [tally]);
  if (!pics.length) return <p className="wp-muted wp-small mm-none">No muscle work on this day.</p>;
  return (
    <div className="mm-pics" aria-label={label}>
      {pics.map((p, i) => (
        <figure key={p.key} className={`mm-shot${i === 0 ? " hero" : ""}`}>
          <MusclePic file={p.file} label={`${p.label} highlighted`} />
          <figcaption>{p.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** The whole week: a picture for every muscle trained, with how many days work it. */
export function WeekPictures({ week }) {
  const pics = useMemo(() => weekImages(week), [week]);
  if (!pics.length) return <p className="wp-muted wp-small mm-none">No muscle work this week.</p>;
  return (
    <div className="mm-pics mm-weekgrid" aria-label="Muscles trained this week">
      {pics.map((p) => (
        <figure key={p.key} className="mm-shot">
          <MusclePic file={p.file} label={`${p.label} highlighted`} />
          <figcaption>{p.label}<b className={p.level === "primary" ? "p" : "s"}>{p.days} day{p.days === 1 ? "" : "s"}</b></figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Every muscle of each group that is touched; the ones worked are filled, so "chest: upper, middle" shows which parts you hit. */
export function MuscleList({ tally }) {
  const groups = useMemo(() => groupsOf(tally), [tally]);
  if (!groups.length) return <p className="wp-muted wp-small">No muscle work on this day.</p>;
  return (
    <ul className="mm-groups">
      {groups.map((g) => (
        <li key={g.group}>
          <b>{g.label}</b>
          <div className="mm-chips">
            {g.regions.map((x) => <span key={x.id} className={`mm-chip${x.level ? ` ${x.level === "primary" ? "p" : "s"}` : ""}`} title={x.note}>{x.label}{x.sets ? <i>{x.sets}</i> : null}</span>)}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The small picture on a day button: the best-fitting picture for that day, or a dash on a rest day. */
function MiniPic({ tally, label }) {
  const first = useMemo(() => imagesFor(tally, 1)[0], [tally]);
  return first ? <MusclePic file={first.file} label={label} className="mm-mini" /> : <span className="mm-mini mm-restpic" role="img" aria-label={`${label}: none`}>–</span>;
}

/**
 * The week at a glance: a small picture for every day, tap one for the big picture and the list. "Week" adds them up (a muscle worked on more days is stronger).
 * `days`: plan days (unified days with blocks, or personal-plan days with items). `todayDow` (1-7) opens that day first.
 */
export default function MuscleWeek({ days, todayDow = 0, title = "Muscles trained this week" }) {
  const list = days || [];
  const wt = useMemo(() => weekTally(list), [list]);
  const firstWithWork = Math.max(0, list.findIndex((d, i) => Object.keys(wt.byDay[i] || {}).length));
  const start = todayDow && list[todayDow - 1] ? todayDow - 1 : firstWithWork;
  const [sel, setSel] = useState(start);       // a day index, or -1 for the whole week
  const idx = sel >= list.length ? 0 : sel;
  const weekAsTally = useMemo(() => Object.fromEntries(Object.entries(wt.week).map(([id, x]) => [id, { level: x.level, sets: x.sets }])), [wt]);
  const weekTop = useMemo(() => weekImages(wt.week).slice(0, 4), [wt]);
  const tally = idx === -1 ? weekAsTally : wt.byDay[idx] || {};
  const lab = (d, i) => d.short || SHORT[(d.dow || i + 1) - 1];
  const exs = idx === -1 ? [] : dayExercises(list[idx]);
  if (!list.length) return null;
  const line = idx === -1 ? "" : summaryLine(tally);
  return (
    <section className="wp-card mm-card" aria-label={title}>
      <h3 className="wp-h">{title}</h3>
      <div className="mm-strip" role="tablist" aria-label="Day of the week">
        {list.map((d, i) => {
          const t = wt.byDay[i] || {}, has = Object.keys(t).length > 0;
          return (
            <button key={i} type="button" role="tab" aria-selected={idx === i} className={`mm-day${idx === i ? " on" : ""}${has ? "" : " rest"}`} onClick={() => setSel(i)}>
              <MiniPic tally={t} label={`${lab(d, i)} muscles`} />
              <span>{lab(d, i)}</span>
            </button>
          );
        })}
        <button type="button" role="tab" aria-selected={idx === -1} className={`mm-day mm-weekbtn${idx === -1 ? " on" : ""}`} onClick={() => setSel(-1)}>
          <span className="mm-mosaic" aria-hidden="true">{weekTop.map((p) => <MusclePic key={p.key} file={p.file} label="" />)}</span>
          <span>Week</span>
        </button>
      </div>
      <p className="mm-title">{idx === -1 ? "Whole week: a picture for every muscle, with how many days it is worked" : `${lab(list[idx], idx)}${list[idx].title ? ` · ${list[idx].title}` : ""}`}</p>
      {idx !== -1 && line && <p className="wp-muted wp-small mm-line">Main muscles: {line}</p>}
      {idx === -1 ? <WeekPictures week={wt.week} /> : <DayPictures tally={tally} label={`${lab(list[idx], idx)} muscles`} />}
      <div className="mm-legend" aria-hidden="true"><span><i className="mm-sw p" />Main muscle</span><span><i className="mm-sw s" />Helper (shown orange in the combined pictures)</span><span><i className="mm-sw" />Not worked</span></div>
      <MuscleList tally={tally} />
      {idx !== -1 && exs.length > 0 && <details className="mm-ex"><summary>{exs.length} exercise{exs.length === 1 ? "" : "s"} this day</summary><ul>{exs.map((e, i) => <li key={`${e.id}${i}`}>{e.name}</li>)}</ul></details>}
      {idx === -1 && <p className="wp-muted wp-small">{Object.keys(GROUP_LABEL).filter((g) => groupsOf(weekAsTally).some((x) => x.group === g)).length} of 7 muscle groups are trained this week.</p>}
    </section>
  );
}
