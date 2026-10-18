// The 17 anime scenes used on Home. Files live in public/scenes/<slug>.webp (full) and <slug>-t.webp (thumbnail).
// `land` = landscape (3:2) or portrait (2:3). `fx` picks the little ambient effect layered on top of the picture.
const BASE = import.meta.env.BASE_URL;
const S = (slug, who, line, land, fx) => ({ slug, who, line, land, fx, src: `${BASE}scenes/${slug}.webp`, thumb: `${BASE}scenes/${slug}-t.webp` });

export const SCENES = [
  S("naruto-discipline", "Naruto", "Discipline now leads to a brighter future.", true, "leaf"),
  S("luffy", "Luffy", "Good food, stronger me, one step at a time.", true, "spark"),
  S("tanjiro", "Tanjiro", "Small steps every day create big changes.", true, "petal"),
  S("goku-explore", "Goku", "Explore today, discover a brighter you.", true, "spark"),
  S("gojo", "Gojo", "Be present. Be consistent. See the results.", true, "spark"),
  S("naruto-ramen", "Naruto", "Enjoy the journey today for a stronger tomorrow.", true, "leaf"),
  S("asta", "Asta", "Hard work, persistence, a stronger me.", true, "spark"),
  S("goku-learn", "Goku", "Be curious. Learn daily. Grow stronger.", true, "petal"),
  S("naruto-study", "Naruto", "Training, good food, self care, progress.", true, "leaf"),
  S("deku-chill", "Deku", "Better habits today create a stronger tomorrow.", false, "petal"),
  S("todoroki", "Todoroki", "Discipline builds freedom.", false, "spark"),
  S("kakashi", "Kakashi", "Discipline today builds a stronger tomorrow.", false, "leaf"),
  S("vegeta", "Vegeta", "Push today for a stronger tomorrow.", false, "spark"),
  S("eren", "Eren", "Better habits today create a stronger tomorrow.", false, "leaf"),
  S("killua", "Killua", "Small steps today create a stronger tomorrow.", false, "spark"),
  S("deku-action", "Deku", "Take action today for a stronger tomorrow.", false, "spark"),
  S("ichigo", "Ichigo", "Progress today creates a stronger tomorrow.", false, "petal"),
];

/** Scene that opens today: rotates daily so the page never looks the same two days in a row. */
export function todayIndex(d = new Date()) {
  const day = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  return day % SCENES.length;
}
export const sceneAt = (i) => SCENES[((i % SCENES.length) + SCENES.length) % SCENES.length];
