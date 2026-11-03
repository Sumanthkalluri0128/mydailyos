// Real photos for the exercises, cut from the four "Complete Exercise Library" sheets (public/exercises/*.webp).
//   thumb  /exercises/<thumb>.webp          one clear picture (lists, live workout)
//   how    /exercises/<how>.webp            the step-by-step strip (4 frames with their step names), when the sheet has one
// An exercise gets its photo by NAME (the plan, the alternatives and the library all use the names from the sheets), so a different
// exercise never borrows a photo that shows another movement. No match = the drawn figure is used instead (utils/exerciseFigure.js).
//
// Row: [thumb, how | null, [names that show this photo], tips (from the sheet, optional)]

const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";

const ROWS = [
  // ---- Part 1: upper body
  ["bench-press", "bench-press-how", ["Barbell Bench Press", "Bench Press"], ["Keep your back slightly arched.", "Keep shoulders pulled back.", "Control the lowering phase.", "Use a spotter for safety."]],
  ["lat-pulldown", "lat-pulldown-how", ["Lat Pulldown"], ["Keep your chest up.", "Pull with your back (not arms).", "Use a full range of motion.", "Avoid leaning too far back."]],
  ["overhead-press", "overhead-press-how", ["Overhead Shoulder Press", "DB Shoulder Press", "Seated DB Shoulder Press", "Shoulder Press"], ["Keep your core tight.", "Don't arch your lower back.", "Use a controlled motion.", "Keep elbows slightly forward."]],
  ["squat", "squat-how", ["Squat", "Barbell Squat", "Squat (Barbell)"], ["Keep your chest up.", "Knees in line with toes.", "Keep your core tight.", "Use a controlled tempo."]],
  ["rdl", "rdl-steps-how", ["Romanian Deadlift (Light DB / Bar)", "Romanian Deadlift", "Romanian Deadlift (RDL)", "Dumbbell RDL"], ["Keep your back straight.", "Move from your hips (not knees).", "Feel the stretch in your hamstrings.", "Keep the weight close to your legs."]],
  ["biceps-curl", "biceps-curl-how", ["DB Biceps Curl", "Biceps Curl", "DB Biceps Curl (Supinated)"], ["Keep your elbows still.", "Use a controlled movement.", "Avoid swinging your body.", "Use the full range of motion."]],
  ["triceps-pushdown", "triceps-pushdown-how", ["Triceps Pushdown"], ["Keep your elbows fixed.", "Use only your triceps.", "Don't lean forward too much.", "Control both up and down."]],
  ["push-up", "push-up-how", ["Push-up", "Push-Up"], ["Keep your body straight.", "Don't flare your elbows out.", "Go at a controlled pace.", "Keep your core engaged."]],
  // ---- Part 2: lower body
  ["squat-steps", "squat-steps-how", ["Goblet Squat"], ["Start with bodyweight or machine variations.", "Keep your core tight and back neutral.", "Focus on the full range of motion."]],
  ["leg-press", "leg-press-how", ["Leg Press (Light)", "Leg Press"], ["Keep your back and hips on the pad.", "Do not lock out your knees.", "Use a weight you can control."]],
  ["lunge", "lunge-how", ["Lunge", "Bodyweight Lunge"], ["Keep your chest up and balance.", "Front knee stays over the ankle.", "Push through the front heel."]],
  ["hip-thrust", "hip-thrust-how", ["Hip Thrust", "Hip Thrust (On Bench, Light Weight)", "Hip Thrust (On Bench, Light)"], ["Drive through your heels.", "Squeeze your glutes for 1 to 2 seconds at the top.", "Lower with control."]],
  ["calf-raise", "calf-raise-how", ["Calf Raise"], ["Rise as high as you can.", "Squeeze the calves for 1 second.", "Lower slowly and with control."]],
  ["glute-bridge", "glute-bridge-how", ["Glute Bridge", "Floor Glute Bridge (Bodyweight)"], ["Drive your hips up and squeeze your glutes.", "Hold for 1 second at the top.", "Lower slowly."]],
  ["leg-extension", "leg-extension-how", ["Leg Extension (Machine)", "Leg Extension"], ["Squeeze your quads for 1 second.", "Lower with control.", "Do not swing the weight."]],
  ["leg-curl", "leg-curl-how", ["Leg Curl (Machine)", "Lying Leg Curl (Machine)"], ["Squeeze your hamstrings for 1 second.", "Lower slowly with control."]],
  // ---- Part 3: core, cardio, conditioning
  ["plank", "plank-how", ["Plank"], ["Keep a straight body line.", "Don't let your hips sag or rise.", "Keep your core and glutes tight.", "Breathe normally."]],
  ["crunch", "crunch-how", ["Crunch"], ["Hands lightly behind your head.", "Lift with your abs, not your neck.", "Squeeze for 1 second, lower slowly."]],
  ["leg-raise", "leg-raise-how", ["Leg Raise", "Lying Leg Raise"], ["Keep your core tight.", "Lower slowly without touching the floor."]],
  ["russian-twist", "russian-twist-how", ["Russian Twist"], ["Lean back slightly, keep your core tight.", "Twist your torso, not just your arms."]],
  ["bicycle-crunch", "bicycle-crunch-how", ["Bicycle Crunch", "Bicycle Crunch (Slow & Controlled)"], ["Switch sides in a controlled way.", "Elbow to the opposite knee."]],
  ["mountain-climber", "mountain-climber-how", ["Mountain Climber", "Mountain Climber (Slow)"], ["Start in a high plank.", "Keep a steady pace and a tight core."]],
  ["treadmill", null, ["Treadmill Walk / Run", "Treadmill / Cycle / Elliptical", "Brisk Walk", "Brisk Walk (Outdoors)", "Brisk Walking (Outdoors)", "Brisk Walk or Cycle / Elliptical", "Easy Cardio"], ["Start at a comfortable speed.", "Keep an upright posture.", "Increase speed or incline gradually."]],
  ["cycling", null, ["Stationary Bike", "Cycling (Stationary)"], ["Adjust the seat height.", "Keep a steady pace.", "Keep your core engaged."]],
  ["elliptical", null, ["Elliptical (Cross Trainer)", "Elliptical Trainer"], ["Hold the handles lightly.", "Keep an upright posture.", "Move in a smooth, steady motion."]],
  ["rowing", null, ["Rowing Machine", "Rowing (Light Pace)"], ["Push with your legs, then pull with your arms.", "Keep your back straight.", "Keep a steady rhythm."]],
  ["jump-rope", null, ["Jump Rope"], ["Use a rope of the correct length.", "Jump on the balls of your feet.", "Keep a light, quick bounce."]],
  ["hiit", null, ["HIIT (High-Intensity)", "HIIT"], ["Choose 3 to 5 exercises.", "30 to 40 seconds of work, 15 to 20 seconds of rest.", "Repeat for 10 to 20 minutes."]],
  // ---- Part 4: warm-up, mobility, cool-down (the photo only; the dose comes from the plan)
  ["arm-circles", null, ["Arm Circles"], []],
  ["shoulder-rolls", null, ["Shoulder Rolls"], []],
  ["torso-twist", null, ["Torso Twist"], []],
  ["hip-circles", null, ["Hip Circles"], []],
  ["leg-swings", null, ["Leg Swings"], []],
  ["high-knees", null, ["High Knees"], []],
  ["butt-kicks", null, ["Butt Kicks"], []],
  ["bw-squat", null, ["Bodyweight Squat"], []],
  ["cat-cow", null, ["Cat-Cow"], []],
  ["thoracic-rotation", null, ["Thoracic Rotation"], []],
  ["worlds-greatest", null, ["World's Greatest Stretch", "World's Greatest Stretch (Dynamic)"], []],
  ["ankle-mobility", null, ["Ankle Mobility"], []],
  ["hip-opener", null, ["Hip Opener", "90/90 Hip Stretch"], []],
  ["lateral-lunge", null, ["Lateral Lunge Stretch"], []],
  ["chest-stretch", null, ["Chest Stretch"], []],
  ["shoulder-stretch", null, ["Shoulder Stretch"], []],
  ["triceps-stretch", null, ["Triceps Stretch"], []],
  ["lat-stretch", null, ["Lat Stretch"], []],
  ["hip-flexor-stretch", null, ["Hip Flexor Stretch"], []],
  ["hamstring-stretch", null, ["Hamstring Stretch"], []],
  ["calf-stretch", null, ["Calf Stretch"], []],
  ["quad-stretch", null, ["Quad Stretch"], []],
  ["glute-stretch", null, ["Glute Stretch", "Figure-4 Stretch (Lying)"], []],
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const BY_NAME = new Map();
for (const [thumb, how, names, tips] of ROWS) {
  const rec = { thumb: `${BASE}exercises/${thumb}.webp`, how: how ? `${BASE}exercises/${how}.webp` : "", tips };
  for (const n of names) if (!BY_NAME.has(norm(n))) BY_NAME.set(norm(n), rec);
}

/** { thumb, how, tips } for an exercise (by name), or null when the sheets have no photo of that movement. */
export function imageFor(ex) {
  if (!ex || !ex.name) return null;
  return BY_NAME.get(norm(ex.name)) || null;
}

/** Every exercise name that has a photo (for tests and the library). */
export const PHOTO_NAMES = ROWS.flatMap((r) => r[2]);
export const hasPhoto = (name) => BY_NAME.has(norm(name));
export const photoFor = (name) => BY_NAME.get(norm(name)) || null;
