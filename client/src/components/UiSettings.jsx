// Profile: "Show all features" (simple vs advanced mode) and the UI language.
import { useState } from "react";
import Buddy from "../motion/Buddy";
import { notify } from "../utils/notify";
import { setShowAll, useFeatures } from "../utils/features";
import { setLarge, useLarge } from "../utils/a11yPrefs";
import { LANGS, needsReview, setLang, useT } from "../i18n";
import "./coachcards.css";

export default function UiSettings() {
  const f = useFeatures();
  const { t, lang } = useT();
  const large = useLarge();
  const [busy, setBusy] = useState(false);
  const toggle = async (on) => { setBusy(true); try { await setShowAll(on); } catch (e) { notify(e.message, "error"); } finally { setBusy(false); } };
  const locked = f.showAll ? [] : (f.locked || []);
  const NAME = { recipes: "nav.recipes", health: "nav.health", goals: "nav.goals", habit: "nav.habit", achievements: "nav.goals", weekly: "nav.progress", northstar: "nav.goals" };
  return (
    <section className="large-card cc-tone" aria-label={t("mode.title")}>
      <div className="cc-sensei"><Buddy scene="health" size={64} who="kakashi" talk={false} label="" /><h3>{t("mode.title")}</h3></div>
      <label className="cc-switch"><input type="checkbox" checked={!!f.showAll} disabled={busy} onChange={(e) => toggle(e.target.checked)} /> <span>{f.showAll ? t("mode.all") : t("mode.simple")}</span></label>
      <small>{t("mode.hint")}</small>
      {locked.length > 0 && <ul className="cc-locked">{locked.map((x) => <li key={x.id}><b>{t(NAME[x.id] || "nav.more")}</b> · {t("mode.locked", { hint: x.hint })}</li>)}</ul>}
      <h3 style={{ marginTop: 18 }}>{t("a11y.title")}</h3>
      <label className="cc-switch"><input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} /> <span>{t("a11y.large")}</span></label>
      <small>{t("a11y.largeHint")}</small>
      <h3 style={{ marginTop: 18 }}>{t("lang.title")}</h3>
      <div className="cc-days" role="radiogroup" aria-label={t("lang.title")}>
        {LANGS.map((l) => <button key={l} type="button" role="radio" aria-checked={lang === l} className={`cc-day${lang === l ? " on" : ""}`} onClick={() => setLang(l)}>{t(`lang.${l}`)}</button>)}
      </div>
      <small>{t("lang.hint")}{needsReview(lang) ? ` ${t("lang.review")}` : ""}</small>
    </section>
  );
}
