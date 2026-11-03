// Exercises that are in the four "Complete Exercise Library" sheets but not in the 7-day plan. They appear in the Library tab
// (with their photos, steps and the alternatives named on the sheet) so nothing from the sheets is lost.
// Shape matches the plan items (id, name, dose, targets, steps, avoid, alts) so the same detail sheet shows them.
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const alts = (parent, names) => names.map((name, i) => ({ id: `${parent}--${slug(name)}`, name, note: "", alt: true, parent, _i: i }));
const x = (id, name, cat, dose, steps, o = {}) => ({
  id, name, cat, dose, steps, avoid: o.avoid || "", targets: o.targets || [cat], helpers: o.helpers || [],
  fig: "", slot: "", kind: "", alts: alts(id, o.alts || []), extra: true, blockType: "extra", days: [],
});

export const EXTRAS = [
  // ---- upper body
  x("x-bench-press", "Barbell Bench Press", "chest", "3 sets of 8 to 10 reps", [
    "Lie on a flat bench. Feet on the floor, grip the bar slightly wider than your shoulders.",
    "Unlock the bar and lower it to your mid-chest with control.",
    "Press the bar up with power.",
    "Lock out at the top without overextending.",
  ], { helpers: ["arms", "shoulders"], avoid: "Bouncing the bar off your chest. Lifting heavy without a spotter.", alts: ["Dumbbell Bench Press", "Incline Bench Press", "Push-up (Weighted)", "Chest Press (Machine)"] }),
  x("x-push-up", "Push-up", "chest", "3 sets of 8 to 12 reps", [
    "Place your hands slightly wider than shoulder-width. Keep your body in a straight line.",
    "Bend your elbows and lower your chest towards the floor (about 2 to 3 inches).",
    "Push through your palms to return to the top.",
    "Keep your core tight and repeat.",
  ], { helpers: ["arms", "shoulders", "core"], avoid: "Letting your hips sag. Flaring your elbows out wide.", alts: ["Incline Push-up (Beginner)", "Knee Push-up (Easier)", "Decline Push-up (Harder)", "Chest Press (Machine)"] }),
  // ---- lower body
  x("x-barbell-squat", "Barbell Squat", "legs", "3 sets of 8 to 10 reps", [
    "Put the bar on your upper back (traps). Stand with feet shoulder-width apart.",
    "Push your hips back and bend your knees.",
    "Lower until your thighs are parallel or slightly below.",
    "Push through your heels and stand up with control.",
    "Return to the start and keep your balance.",
  ], { helpers: ["glutes", "core"], avoid: "Letting your knees cave in. Rounding your back.", alts: ["Goblet Squat", "Leg Press", "Split Squat (Lunge)", "Step-up"] }),
  x("x-lunge", "Lunge", "legs", "3 sets of 8 to 10 reps each leg", [
    "Stand tall with your feet together.",
    "Step forward with one leg.",
    "Lower until both knees are about 90 degrees.",
    "Keep your chest up and your balance.",
    "Push through the front heel to stand.",
  ], { helpers: ["glutes"], avoid: "Letting the front knee fall inward.", alts: ["Reverse Lunge", "Walking Lunge", "Bulgarian Split Squat"] }),
  x("x-leg-extension", "Leg Extension (Machine)", "legs", "3 sets of 10 to 15 reps", [
    "Sit and set the pad to rest on your ankles.",
    "Hold the side handles.",
    "Extend your legs fully.",
    "Squeeze your quads for 1 second.",
    "Lower with control.",
  ], { avoid: "Swinging the weight up.", alts: ["Resistance Band Extension", "Sissy Squat", "Bodyweight Squat"] }),
  // ---- core
  x("x-leg-raise", "Leg Raise", "core", "3 sets of 10 to 12 reps", [
    "Lie on your back with your hands by your sides.",
    "Keep your legs straight and raise them to about 90 degrees.",
    "Pause for 1 second and keep your core tight.",
    "Lower slowly without touching the floor.",
  ], { avoid: "Arching your lower back off the floor.", alts: ["Hanging Leg Raise", "Reverse Crunch", "Knee Raise"] }),
  // ---- cardio
  x("x-treadmill", "Treadmill Walk / Run", "cardio", "15 to 30 min", [
    "Start at a comfortable speed.",
    "Keep an upright posture.",
    "Increase the speed or incline gradually.",
    "Walk (steady, low intensity) or run (intervals) depending on your goal.",
  ], { avoid: "Holding the rails the whole time." }),
  x("x-cycling", "Cycling (Stationary)", "cardio", "15 to 30 min", [
    "Adjust the seat height.",
    "Keep a steady pace.",
    "Keep your core engaged.",
    "Try 15 to 30 minute sessions.",
  ], { targets: ["cardio", "legs"] }),
  x("x-elliptical", "Elliptical Trainer", "cardio", "15 to 30 min", [
    "Hold the handles lightly.",
    "Keep an upright posture.",
    "Move in a smooth, steady motion.",
    "15 to 30 minutes builds endurance.",
  ]),
  x("x-rowing", "Rowing Machine", "cardio", "10 to 20 min", [
    "Sit and strap your feet in.",
    "Push with your legs first, then pull with your arms.",
    "Keep your back straight.",
    "Keep a steady rhythm.",
  ], { targets: ["cardio", "back", "legs"] }),
  x("x-jump-rope", "Jump Rope", "cardio", "30 to 60 sec sets", [
    "Use a rope of the correct length.",
    "Jump on the balls of your feet.",
    "Keep a light, quick bounce.",
    "Start with 30 to 60 second sets.",
  ]),
  x("x-hiit", "HIIT (High-Intensity)", "cardio", "10 to 20 min", [
    "Choose 3 to 5 exercises.",
    "Work for 30 to 40 seconds.",
    "Rest for 15 to 20 seconds.",
    "Repeat for 10 to 20 minutes.",
  ], { avoid: "Doing HIIT on back-to-back days when you are new to training." }),
  // ---- warm-up / mobility / cool-down
  x("x-torso-twist", "Torso Twist", "mobility", "20 sec", [
    "Stand tall with your feet hip-width apart and your arms out front.",
    "Rotate your torso gently to one side, then the other.",
    "Keep your hips facing forward.",
  ]),
  x("x-high-knees", "High Knees", "mobility", "30 sec", [
    "Stand tall.",
    "Drive one knee up to hip height, then switch.",
    "Pump your arms and stay light on your feet.",
  ]),
  x("x-butt-kicks", "Butt Kicks", "mobility", "30 sec", [
    "Stand tall.",
    "Kick one heel up towards your glutes, then switch.",
    "Keep a quick, light rhythm.",
  ]),
  x("x-lateral-lunge", "Lateral Lunge Stretch", "mobility", "10 per side", [
    "Stand with your feet wide apart.",
    "Shift your weight to one side and bend that knee, keeping the other leg straight.",
    "Keep your chest up and your heel down.",
    "Push back to the middle and switch sides.",
  ]),
  x("x-hip-flexor-stretch", "Hip Flexor Stretch", "mobility", "30 sec per side", [
    "Kneel on one knee with the other foot in front.",
    "Tuck your pelvis and shift forward gently.",
    "Feel the stretch at the front of the back hip.",
    "Hold, breathe, then switch sides.",
  ]),
];
