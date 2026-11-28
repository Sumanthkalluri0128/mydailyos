// The 7-day beginner plan ("Lean & Toned"), written down once so every screen reads the same source.
// Everything here comes from the four plan sheets: the day layouts, the sets/reps/rest, the 3-4 alternatives
// for every exercise, and the warm-up / cool-down / mobility rows. Edit THIS file to change the plan; nothing else needs touching.
//
// Assumptions worth checking (the sheets did not show them):
//   - Day 5 (Fri) "Lower B" and Day 6 (Sat) "Conditioning" are built from the alternatives on your sheets (Goblet Squat, DB RDL, Hip Thrust...
//     and the circuit row), because only Days 1-4 were shown in full.
//   - Sets / reps / rest on Days 1-4 follow the screenshot where visible, otherwise the "2-3 sets, 8-15 reps, 60-120 s" rule on the sheets.

export type Cat = 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Glutes' | 'Core' | 'Cardio';
export type Gear = 'Bodyweight' | 'Machine' | 'Dumbbell' | 'Cable' | 'Band' | 'Kettlebell' | 'Bench' | 'Other';
export type Unit = 'reps' | 'sec' | 'min';

export type Exercise = {
  id: string;
  name: string;
  cat: Cat;
  gear: Gear;
  /** Muscles shown as chips: the first is the main one. */
  muscles: string[];
  /** Highlight groups for the illustrated figure (chest, back, shoulders, arms, core, legs, glutes). */
  targets: string[];
  steps: string[];
  tip: string;
  /** Existing picture id in utils/exerciseFigure (or a slot name) so the illustration matches the movement. */
  fig?: string;
  slot?: string;
  unit?: Unit;
  /** Done on each side (the log counts both sides as one set). */
  perSide?: boolean;
};

const E: Record<string, Exercise> = {};
type Spec = Omit<Exercise, 'id'>;
function add(id: string, s: Spec) { E[id] = { id, ...s }; }

const T = {
  chest: ['chest'], back: ['back'], sh: ['shoulders'], arms: ['arms'], core: ['core'], legs: ['legs'], glutes: ['glutes'],
  legsGlutes: ['legs', 'glutes'], pushUp: ['chest', 'arms'], pull: ['back', 'arms'], press: ['shoulders', 'arms'], none: [] as string[],
};

// ---------------------------------------------------------------------------------------------------------------- CHEST
add('incline-pushup', { name: 'Incline Push-up', cat: 'Chest', gear: 'Bench', muscles: ['Upper chest', 'Triceps', 'Front shoulders'], targets: T.pushUp, fig: 'incline-pushup',
  steps: ['Hands on a bench or sturdy box, a bit wider than your shoulders, body in one straight line.', 'Lower your chest to the edge with elbows about 45° from your body.', 'Press the floor away until your arms are straight, without letting your hips sag.'], tip: 'The higher the surface, the easier it is. Lower the surface as you get stronger.' });
add('wall-pushup', { name: 'Wall Push-up', cat: 'Chest', gear: 'Bodyweight', muscles: ['Chest', 'Triceps'], targets: T.pushUp, fig: 'incline-pushup',
  steps: ['Stand an arm\'s length from a wall, hands on it at chest height, shoulder-width apart.', 'Bend your elbows and bring your chest toward the wall, body straight.', 'Push back to the start with control.'], tip: 'Step your feet further back to make it harder.' });
add('knee-pushup', { name: 'Knee Push-up', cat: 'Chest', gear: 'Bodyweight', muscles: ['Chest', 'Triceps', 'Core'], targets: T.pushUp, fig: 'knee-pushup',
  steps: ['Hands under your shoulders, knees on the floor, a straight line from head to knees.', 'Lower your chest toward the floor, elbows about 45° out.', 'Press up until your arms are straight.'], tip: 'Squeeze your glutes so your hips stay in line.' });
add('chest-press-machine', { name: 'Machine Chest Press', cat: 'Chest', gear: 'Machine', muscles: ['Chest', 'Triceps', 'Front shoulders'], targets: T.pushUp, fig: 'chest-press-machine',
  steps: ['Set the seat so the handles are level with your mid-chest. Back flat on the pad, feet planted.', 'Press the handles forward until your arms are almost straight, without locking out.', 'Return slowly until you feel a light stretch across your chest.'], tip: 'Keep your shoulder blades pinned back and down the whole time.' });
add('db-floor-press', { name: 'DB Floor Press', cat: 'Chest', gear: 'Dumbbell', muscles: ['Chest', 'Triceps'], targets: T.pushUp, fig: 'floor-press',
  steps: ['Lie on the floor, knees bent, a dumbbell in each hand over your chest.', 'Lower until your upper arms lightly touch the floor.', 'Press back up without bouncing off the floor.'], tip: 'The floor limits the range, which is kind to beginner shoulders.' });
add('db-bench-press', { name: 'DB Bench Press', cat: 'Chest', gear: 'Dumbbell', muscles: ['Chest', 'Triceps', 'Front shoulders'], targets: T.pushUp, fig: 'db-bench',
  steps: ['Lie on a flat bench, dumbbells at chest level, feet flat on the floor.', 'Press up until your arms are straight over your chest.', 'Lower slowly to the sides of your chest.'], tip: 'Start light. A spotter or a lower weight is better than a rushed rep.' });
add('cable-chest-press', { name: 'Cable Chest Press', cat: 'Chest', gear: 'Cable', muscles: ['Chest', 'Triceps'], targets: T.pushUp, slot: 'hpress',
  steps: ['Set the handles at chest height and step forward into a split stance.', 'Press both handles forward until your arms are straight.', 'Return slowly with your elbows just behind your body.'], tip: 'Stay tall and let the cables do the work, not a lean.' });

// ---------------------------------------------------------------------------------------------------------------- BACK
add('seated-cable-row', { name: 'Seated Cable Row', cat: 'Back', gear: 'Cable', muscles: ['Mid back', 'Lats', 'Biceps'], targets: T.pull, fig: 'seated-row',
  steps: ['Sit tall with your feet on the plate, knees slightly bent, and hold the handle with straight arms.', 'Pull the handle to your belly, squeezing your shoulder blades together.', 'Return slowly until your arms are straight again, without rounding your back.'], tip: 'Think "elbows to back pockets", not "pull with hands".' });
add('chest-supported-row', { name: 'Chest-Supported Machine Row', cat: 'Back', gear: 'Machine', muscles: ['Mid back', 'Lats', 'Rear shoulders'], targets: T.pull, fig: 'chest-row-machine',
  steps: ['Adjust the seat so your chest rests on the pad and your arms reach the handles.', 'Pull the handles back, squeezing your shoulder blades.', 'Return slowly to a full stretch.'], tip: 'The pad takes the strain off your lower back.' });
add('band-row', { name: 'Resistance Band Row', cat: 'Back', gear: 'Band', muscles: ['Mid back', 'Biceps'], targets: T.pull, fig: 'band-row',
  steps: ['Sit with legs straight, band around your feet, a handle in each hand.', 'Pull your hands to your ribs, squeezing your back.', 'Release slowly with control.'], tip: 'Sit tall. Do not lean back to pull.' });
add('one-arm-db-row', { name: 'One-Arm DB Row', cat: 'Back', gear: 'Dumbbell', muscles: ['Lats', 'Mid back', 'Biceps'], targets: T.pull, fig: 'db-row', perSide: true,
  steps: ['One hand and the same-side knee on a bench, back flat, dumbbell hanging below your shoulder.', 'Pull the dumbbell toward your hip, keeping your elbow close.', 'Lower slowly. Finish all reps, then switch sides.'], tip: 'Keep your hips square. Do not twist to lift.' });
add('supported-tbar-row', { name: 'Supported T-Bar Row', cat: 'Back', gear: 'Machine', muscles: ['Mid back', 'Lats'], targets: T.pull, fig: 'tbar',
  steps: ['Chest against the support pad, feet planted, handles held with straight arms.', 'Pull the handles toward your lower ribs.', 'Lower with control until your arms are straight.'], tip: 'Choose a light plate first. Your back should stay flat.' });
add('lat-pulldown', { name: 'Lat Pulldown', cat: 'Back', gear: 'Cable', muscles: ['Lats', 'Mid back', 'Biceps'], targets: T.pull, fig: 'lat-pulldown',
  steps: ['Sit with your thighs snug under the pads and grab the bar slightly wider than your shoulders.', 'Pull the bar to your upper chest, leading with your elbows.', 'Squeeze your back, then let the bar rise slowly until your arms are straight.'], tip: 'Lean back only slightly and never pull the bar behind your neck.' });
add('assisted-pullup', { name: 'Assisted Pull-up', cat: 'Back', gear: 'Machine', muscles: ['Lats', 'Biceps'], targets: T.pull, fig: 'assisted-pullup',
  steps: ['Set the assistance so you can do 8 or more clean reps, and hold the bar with palms forward.', 'Pull your chest toward the bar, elbows down and back.', 'Lower slowly to straight arms.'], tip: 'More assistance is not a failure. It is how you build up.' });
add('neutral-pulldown', { name: 'Neutral-Grip Pulldown', cat: 'Back', gear: 'Cable', muscles: ['Lats', 'Biceps'], targets: T.pull, fig: 'close-pulldown',
  steps: ['Use the close, palms-facing handle and sit with thighs under the pads.', 'Pull the handle to your upper chest, elbows tucked.', 'Return slowly to straight arms.'], tip: 'Neutral grips are often kinder to wrists and shoulders.' });
add('band-pulldown', { name: 'Resistance Band Pulldown', cat: 'Back', gear: 'Band', muscles: ['Lats', 'Biceps'], targets: T.pull, fig: 'band-pulldown',
  steps: ['Anchor a band high, kneel or stand, and hold it with straight arms above you.', 'Pull your elbows down to your sides.', 'Return slowly without letting the band snap back.'], tip: 'Pause for one second at the bottom.' });
add('straight-arm-pulldown', { name: 'Straight-Arm Pulldown', cat: 'Back', gear: 'Cable', muscles: ['Lats'], targets: T.back, fig: 'straight-arm',
  steps: ['Stand facing the high cable, arms straight, a slight hinge at the hips.', 'Sweep the bar down to your thighs, arms straight.', 'Return slowly until your hands are above shoulder height.'], tip: 'Keep your elbows almost straight. This isolates the lats.' });

// ---------------------------------------------------------------------------------------------------------------- SHOULDERS
add('db-shoulder-press', { name: 'DB Shoulder Press', cat: 'Shoulders', gear: 'Dumbbell', muscles: ['Shoulders', 'Triceps'], targets: T.press, fig: 'db-shoulder-press',
  steps: ['Sit or stand tall with a dumbbell at each shoulder, palms forward.', 'Press overhead until your arms are almost straight.', 'Lower slowly back to shoulder height.'], tip: 'Brace your core so your lower back does not arch.' });
add('seated-db-press', { name: 'Seated DB Shoulder Press', cat: 'Shoulders', gear: 'Dumbbell', muscles: ['Shoulders', 'Triceps'], targets: T.press, fig: 'db-shoulder-press',
  steps: ['Sit on a bench with back support, a dumbbell at each shoulder.', 'Press up until your arms are almost straight.', 'Lower under control to ear level.'], tip: 'Keep your back against the pad and your ribs down.' });
add('shoulder-press-machine', { name: 'Machine Shoulder Press', cat: 'Shoulders', gear: 'Machine', muscles: ['Shoulders', 'Triceps'], targets: T.press, fig: 'shoulder-press-machine',
  steps: ['Set the seat so the handles start at shoulder height.', 'Press up without locking your elbows.', 'Lower slowly to the start.'], tip: 'A smooth path makes this the easiest overhead press to learn.' });
add('neutral-db-press', { name: 'Neutral-Grip DB Press', cat: 'Shoulders', gear: 'Dumbbell', muscles: ['Shoulders', 'Triceps'], targets: T.press, fig: 'db-shoulder-press',
  steps: ['Hold dumbbells at shoulder height with palms facing each other.', 'Press up until your arms are almost straight.', 'Lower slowly.'], tip: 'Palms facing in is gentler on tight shoulders.' });
add('landmine-press', { name: 'Landmine Press', cat: 'Shoulders', gear: 'Other', muscles: ['Shoulders', 'Upper chest', 'Triceps'], targets: T.press, fig: 'landmine-press',
  steps: ['Stand holding the end of an anchored bar at your shoulder.', 'Press up and forward until your arm is straight.', 'Lower slowly. Switch arms each set.'], tip: 'The angled path is friendly to shoulders that dislike straight-overhead.' });
add('band-press', { name: 'Seated Band Press', cat: 'Shoulders', gear: 'Band', muscles: ['Shoulders', 'Triceps'], targets: T.press, fig: 'band-ohp',
  steps: ['Sit on a bench with a band under you, handles at shoulder height.', 'Press the handles overhead.', 'Lower slowly against the band.'], tip: 'Keep your wrists straight.' });
add('arnold-press', { name: 'Arnold Press (Light DB)', cat: 'Shoulders', gear: 'Dumbbell', muscles: ['Shoulders', 'Triceps'], targets: T.press, fig: 'db-shoulder-press',
  steps: ['Start with dumbbells at chest height, palms facing you.', 'Rotate your palms forward as you press overhead.', 'Reverse the motion as you lower.'], tip: 'Use a lighter weight than your normal press.' });
add('lateral-raise', { name: 'Lateral Raise', cat: 'Shoulders', gear: 'Dumbbell', muscles: ['Side shoulders'], targets: T.sh, fig: 'lateral-db',
  steps: ['Stand tall with light dumbbells at your sides, a slight bend in your elbows.', 'Raise your arms out to the sides until they reach shoulder height.', 'Lower slowly. Do not swing.'], tip: 'Lead with your elbows, not your hands, and keep the weight light.' });
add('cable-lateral-raise', { name: 'Cable Lateral Raise', cat: 'Shoulders', gear: 'Cable', muscles: ['Side shoulders'], targets: T.sh, fig: 'lateral-cable',
  steps: ['Stand side-on to a low cable, handle in your far hand.', 'Raise your arm out to shoulder height.', 'Lower slowly. Do all reps, then switch.'], tip: 'The cable keeps tension at the bottom of the rep.' });
add('machine-lateral-raise', { name: 'Machine Lateral Raise', cat: 'Shoulders', gear: 'Machine', muscles: ['Side shoulders'], targets: T.sh, fig: 'lateral-machine',
  steps: ['Sit with your arms against the pads and elbows at the pivot.', 'Raise your arms out to shoulder height.', 'Lower slowly.'], tip: 'Relax your neck and shrug-free shoulders.' });
add('leaning-lateral-raise', { name: 'Leaning DB Lateral Raise', cat: 'Shoulders', gear: 'Dumbbell', muscles: ['Side shoulders'], targets: T.sh, fig: 'lateral-db', perSide: true,
  steps: ['Hold a post with one hand and lean away slightly, dumbbell in the free hand.', 'Raise it out to shoulder height.', 'Lower slowly, then switch sides.'], tip: 'The lean lets the muscle work through a longer range.' });
add('band-lateral-raise', { name: 'Band Lateral Raise', cat: 'Shoulders', gear: 'Band', muscles: ['Side shoulders'], targets: T.sh, fig: 'lateral-band',
  steps: ['Stand on a band, a handle in each hand at your sides.', 'Raise your arms out to shoulder height.', 'Lower slowly.'], tip: 'Stop at shoulder height. Higher is not better.' });
add('face-pull', { name: 'Face Pull (Cable/Band)', cat: 'Shoulders', gear: 'Cable', muscles: ['Rear shoulders', 'Upper back'], targets: ['shoulders', 'back'], fig: 'face-pull',
  steps: ['Set a rope or band at face height and step back until your arms are straight.', 'Pull toward your face, elbows high and wide.', 'Squeeze your shoulder blades, then return slowly.'], tip: 'Light weight, high reps. It protects your shoulders and fixes posture.' });
add('rev-pec-deck', { name: 'Reverse Pec Deck', cat: 'Shoulders', gear: 'Machine', muscles: ['Rear shoulders', 'Upper back'], targets: ['shoulders', 'back'], fig: 'rev-pec-deck',
  steps: ['Sit facing the pad with your arms out in front, hands on the handles.', 'Open your arms out to the sides, squeezing your shoulder blades.', 'Return slowly.'], tip: 'Keep the weight light and your chest on the pad.' });
add('band-pull-apart', { name: 'Band Pull-Apart', cat: 'Shoulders', gear: 'Band', muscles: ['Rear shoulders', 'Upper back'], targets: ['shoulders', 'back'], fig: 'band-pull-apart',
  steps: ['Hold a band in front of you at chest height, arms straight.', 'Pull it apart until your arms are in a "T".', 'Return slowly.'], tip: 'A thicker band makes it harder. Start light.' });
add('rear-delt-fly', { name: 'Rear-Delt Fly (Light DB)', cat: 'Shoulders', gear: 'Dumbbell', muscles: ['Rear shoulders', 'Upper back'], targets: ['shoulders', 'back'], fig: 'rear-fly-db',
  steps: ['Hinge forward with a flat back, light dumbbells hanging under your shoulders.', 'Raise your arms out to the sides to shoulder height.', 'Lower slowly.'], tip: 'Very light weights. Think "wide", not "up".' });
add('cable-rear-row', { name: 'Cable Rear-Delt Row', cat: 'Shoulders', gear: 'Cable', muscles: ['Rear shoulders', 'Upper back'], targets: ['shoulders', 'back'], slot: 'rear',
  steps: ['Hold a cable handle at chest height with straight arms.', 'Pull it back with your elbow flared out to the side.', 'Return slowly.'], tip: 'Keep your wrist straight and your shoulder down.' });

// ---------------------------------------------------------------------------------------------------------------- ARMS
add('db-biceps-curl', { name: 'DB Biceps Curl', cat: 'Arms', gear: 'Dumbbell', muscles: ['Biceps'], targets: T.arms, fig: 'db-curl',
  steps: ['Stand tall, dumbbells at your sides, palms forward.', 'Curl them up toward your shoulders, elbows pinned to your sides.', 'Lower slowly.'], tip: 'No swinging. If you must lean back, the weight is too heavy.' });
add('hammer-curl', { name: 'Hammer Curl', cat: 'Arms', gear: 'Dumbbell', muscles: ['Biceps', 'Forearms'], targets: T.arms, fig: 'hammer-curl',
  steps: ['Hold dumbbells at your sides with palms facing each other.', 'Curl up to your shoulders, keeping that grip.', 'Lower slowly.'], tip: 'Keep your elbows still. Only your forearms move.' });
add('cable-curl', { name: 'Cable Curl (Low Pulley)', cat: 'Arms', gear: 'Cable', muscles: ['Biceps'], targets: T.arms, fig: 'cable-curl',
  steps: ['Face a low cable with a bar or handle, elbows at your sides.', 'Curl up toward your shoulders.', 'Lower slowly until your arms are straight.'], tip: 'Constant cable tension means no rest at the top or bottom.' });
add('preacher-curl-machine', { name: 'Preacher Curl (Machine)', cat: 'Arms', gear: 'Machine', muscles: ['Biceps'], targets: T.arms, fig: 'preacher-machine',
  steps: ['Sit with your upper arms flat on the pad and hold the handles.', 'Curl up smoothly.', 'Lower slowly to nearly straight.'], tip: 'The pad stops you cheating. Do not drop at the bottom.' });
add('band-curl', { name: 'Resistance Band Curl', cat: 'Arms', gear: 'Band', muscles: ['Biceps'], targets: T.arms, fig: 'band-curl',
  steps: ['Stand on a band, a handle in each hand, palms forward.', 'Curl up to your shoulders.', 'Lower slowly against the band.'], tip: 'Great at home. Step wider to add tension.' });
add('supinated-curl', { name: 'DB Biceps Curl (Supinated)', cat: 'Arms', gear: 'Dumbbell', muscles: ['Biceps'], targets: T.arms, fig: 'db-curl',
  steps: ['Dumbbells at your sides, palms facing forward.', 'Curl up while turning your pinkies slightly out.', 'Lower slowly.'], tip: 'Squeeze at the top for one second.' });
add('cable-hammer-curl', { name: 'Cable Hammer Curl (Rope)', cat: 'Arms', gear: 'Cable', muscles: ['Biceps', 'Forearms'], targets: T.arms, fig: 'cable-curl',
  steps: ['Attach a rope to a low cable and hold it with palms facing in.', 'Curl up toward your shoulders.', 'Lower slowly.'], tip: 'Keep your elbows tucked to your sides.' });
add('crossbody-hammer-curl', { name: 'Cross-Body Hammer Curl', cat: 'Arms', gear: 'Dumbbell', muscles: ['Biceps', 'Forearms'], targets: T.arms, fig: 'hammer-curl',
  steps: ['Hold dumbbells with palms facing in.', 'Curl one across your body toward the opposite shoulder.', 'Lower slowly and alternate.'], tip: 'Slow and steady beats heavy and swinging.' });
add('band-hammer-curl', { name: 'Band Hammer Curl', cat: 'Arms', gear: 'Band', muscles: ['Biceps', 'Forearms'], targets: T.arms, fig: 'band-curl',
  steps: ['Stand on a band, handles held with palms facing each other.', 'Curl up to your shoulders.', 'Lower slowly.'], tip: 'Keep your wrists neutral.' });
add('triceps-pushdown', { name: 'Triceps Pushdown', cat: 'Arms', gear: 'Cable', muscles: ['Triceps'], targets: T.arms, fig: 'pushdown-rope',
  steps: ['Stand facing a high cable, elbows tucked at your sides, hands on the bar or rope.', 'Press down until your arms are straight.', 'Let your hands rise slowly to chest height.'], tip: 'Only your forearms move. Do not lean over the bar.' });
add('band-pressdown', { name: 'Band Pressdown', cat: 'Arms', gear: 'Band', muscles: ['Triceps'], targets: T.arms, fig: 'band-pushdown',
  steps: ['Anchor a band high and hold it with elbows at your sides.', 'Press down to straight arms.', 'Return slowly.'], tip: 'Squeeze your triceps at the bottom.' });
add('overhead-cable-ext', { name: 'Overhead Cable Extension', cat: 'Arms', gear: 'Cable', muscles: ['Triceps (long head)'], targets: T.arms, fig: 'overhead-cable-ext',
  steps: ['Face away from a cable, rope held behind your head, elbows pointing forward.', 'Straighten your arms out in front.', 'Bend slowly back to a deep stretch.'], tip: 'Keep your elbows close to your head.' });
add('close-grip-machine-press', { name: 'Close-Grip Machine Press', cat: 'Arms', gear: 'Machine', muscles: ['Triceps', 'Chest'], targets: T.pushUp, fig: 'chest-press-machine',
  steps: ['Sit at the chest-press machine and use the narrow or inside handles.', 'Press forward, keeping your elbows close to your body.', 'Return slowly.'], tip: 'Keep your shoulders back and your wrists straight.' });
add('assisted-dip', { name: 'Assisted Dip (if comfortable)', cat: 'Arms', gear: 'Machine', muscles: ['Triceps', 'Chest'], targets: T.arms, fig: 'assisted-dip',
  steps: ['Hold the handles with the assistance set so it feels easy.', 'Lower until your elbows reach about 90°.', 'Press up to straight arms.'], tip: 'Skip this if it bothers your shoulders.' });
add('overhead-triceps-ext', { name: 'Overhead Triceps Extension (DB)', cat: 'Arms', gear: 'Dumbbell', muscles: ['Triceps (long head)'], targets: T.arms, fig: 'db-overhead-ext',
  steps: ['Hold one dumbbell with both hands overhead, arms straight.', 'Bend your elbows to lower it behind your head.', 'Straighten your arms to return.'], tip: 'Keep your elbows pointing forward, not flaring out.' });
add('rope-pushdown', { name: 'Rope Pushdown', cat: 'Arms', gear: 'Cable', muscles: ['Triceps'], targets: T.arms, fig: 'pushdown-rope',
  steps: ['Hold a rope at a high cable, elbows at your sides.', 'Push down and spread the rope slightly at the bottom.', 'Return slowly.'], tip: 'Spreading the rope at the bottom adds a stronger squeeze.' });
add('band-overhead-ext', { name: 'Band Overhead Extension', cat: 'Arms', gear: 'Band', muscles: ['Triceps (long head)'], targets: T.arms, fig: 'db-overhead-ext',
  steps: ['Stand on one end of a band and hold the other behind your head.', 'Straighten your arms overhead.', 'Lower slowly.'], tip: 'A good home option. Keep your ribs down.' });
add('single-db-overhead-ext', { name: 'Single DB Overhead Extension', cat: 'Arms', gear: 'Dumbbell', muscles: ['Triceps (long head)'], targets: T.arms, fig: 'db-overhead-ext', perSide: true,
  steps: ['Hold one dumbbell overhead in one hand.', 'Bend your elbow to lower it behind your head.', 'Straighten to return. Switch arms.'], tip: 'Support your elbow with your other hand if needed.' });
add('closegrip-pushup', { name: 'Close-Grip Push-up (if comfortable)', cat: 'Arms', gear: 'Bodyweight', muscles: ['Triceps', 'Chest'], targets: T.pushUp, fig: 'diamond-pushup',
  steps: ['Hands under your chest, closer than shoulder-width.', 'Lower with your elbows close to your body.', 'Press up to straight arms.'], tip: 'Drop to your knees or use a bench to make it easier.' });

// ---------------------------------------------------------------------------------------------------------------- CORE
add('dead-bug', { name: 'Dead Bug', cat: 'Core', gear: 'Bodyweight', muscles: ['Deep core', 'Abs'], targets: T.core, fig: 'dead-bug', perSide: true,
  steps: ['Lie on your back, arms up and knees bent at 90° over your hips.', 'Lower the opposite arm and leg toward the floor, keeping your lower back pressed down.', 'Return and switch sides.'], tip: 'If your back arches, make the movement smaller.' });
add('heel-taps', { name: 'Heel Taps', cat: 'Core', gear: 'Bodyweight', muscles: ['Lower abs'], targets: T.core, fig: 'dead-bug', perSide: true,
  steps: ['Lie on your back with knees bent at 90° above your hips.', 'Lower one heel to tap the floor, then bring it back.', 'Alternate sides slowly.'], tip: 'Keep your lower back flat on the floor.' });
add('bird-dog', { name: 'Bird Dog', cat: 'Core', gear: 'Bodyweight', muscles: ['Core', 'Lower back', 'Glutes'], targets: ['core', 'glutes'], fig: 'bird-dog', perSide: true,
  steps: ['On hands and knees, hands under shoulders, knees under hips.', 'Reach one arm forward and the opposite leg back, level with your body.', 'Hold for a breath, return, and switch.'], tip: 'Do not twist your hips. Imagine a glass of water on your back.' });
add('bent-knee-march', { name: 'Bent-Knee March', cat: 'Core', gear: 'Bodyweight', muscles: ['Lower abs'], targets: T.core, fig: 'dead-bug', perSide: true,
  steps: ['Lie on your back, knees bent at 90° above your hips.', 'Slowly lower one foot to tap the floor and return.', 'Alternate sides.'], tip: 'An easier cousin of the dead bug.' });
add('short-lever-dead-bug', { name: 'Short Lever Dead Bug', cat: 'Core', gear: 'Bodyweight', muscles: ['Deep core'], targets: T.core, fig: 'dead-bug', perSide: true,
  steps: ['Lie on your back, knees bent at 90°, arms up.', 'Lower the opposite arm and bent leg a short way.', 'Return and switch.'], tip: 'Keep your knees bent so the lever is short and easier.' });
add('russian-twist', { name: 'Russian Twist', cat: 'Core', gear: 'Bodyweight', muscles: ['Obliques', 'Abs'], targets: T.core, slot: 'core',
  steps: ['Sit with knees bent, lean back slightly with a flat back, hands together in front.', 'Rotate your torso to one side, then the other.', 'Keep your chest lifted and move slowly.'], tip: 'Keep your heels on the floor to make it easier.' });
add('pallof-press', { name: 'Pallof Press (Anti-Rotation)', cat: 'Core', gear: 'Cable', muscles: ['Obliques', 'Deep core'], targets: T.core, fig: 'pallof', perSide: true,
  steps: ['Stand side-on to a cable at chest height, handle at your chest.', 'Press your hands straight out and hold for 2 seconds. Do not let the cable twist you.', 'Bring it back and repeat, then switch sides.'], tip: 'You are resisting the pull. Squeeze your glutes.' });
add('seated-band-rotation', { name: 'Seated Band Rotation', cat: 'Core', gear: 'Band', muscles: ['Obliques'], targets: T.core, fig: 'pallof-band', perSide: true,
  steps: ['Sit tall with a band anchored to your side, hands together in front.', 'Rotate your torso away from the anchor, then return.', 'Keep your hips still. Then switch sides.'], tip: 'The twist comes from your ribs, not your arms.' });
add('bicycle-crunch', { name: 'Bicycle Crunch (Slow & Controlled)', cat: 'Core', gear: 'Bodyweight', muscles: ['Abs', 'Obliques'], targets: T.core, slot: 'core',
  steps: ['Lie on your back with hands lightly behind your head, knees bent.', 'Bring one elbow toward the opposite knee as that leg extends.', 'Switch sides slowly. No yanking on your neck.'], tip: 'Slow reps work harder than fast ones.' });
add('standing-cable-rotation', { name: 'Standing Cable Rotation', cat: 'Core', gear: 'Cable', muscles: ['Obliques'], targets: T.core, fig: 'pallof', perSide: true,
  steps: ['Stand side-on to a cable at chest height, handle held with both hands.', 'Rotate your torso away from the stack, arms straight.', 'Return slowly. Then switch sides.'], tip: 'Move from your torso. Keep your hips facing forward.' });
add('plank', { name: 'Plank', cat: 'Core', gear: 'Bodyweight', muscles: ['Abs', 'Lower back', 'Shoulders'], targets: T.core, fig: 'plank', unit: 'sec',
  steps: ['Forearms on the floor, elbows under your shoulders, legs straight.', 'Squeeze your glutes and abs so your body makes one straight line.', 'Hold, breathing steadily.'], tip: 'Stop when your hips sag. A short clean hold beats a long sloppy one.' });
add('elevated-plank', { name: 'Elevated Plank (Bench or Box)', cat: 'Core', gear: 'Bench', muscles: ['Abs', 'Shoulders'], targets: T.core, fig: 'plank', unit: 'sec',
  steps: ['Forearms or hands on a bench, body in a straight line.', 'Squeeze your glutes and abs.', 'Hold, breathing steadily.'], tip: 'The higher the surface, the easier it is.' });
add('side-plank', { name: 'Side Plank (Beginner, Knees)', cat: 'Core', gear: 'Bodyweight', muscles: ['Obliques', 'Hips'], targets: T.core, fig: 'side-plank', unit: 'sec', perSide: true,
  steps: ['Lie on your side, forearm under your shoulder, knees bent.', 'Lift your hips until your body makes a line from knees to head.', 'Hold, then switch sides.'], tip: 'Straighten your legs when it feels easy.' });
add('elbow-knee-plank', { name: 'Elbow to Knee Plank', cat: 'Core', gear: 'Bodyweight', muscles: ['Abs', 'Obliques'], targets: T.core, fig: 'plank', perSide: true,
  steps: ['Start in a high plank.', 'Bring one knee toward the same-side elbow.', 'Return and switch sides, slowly.'], tip: 'Move slowly so your hips stay level.' });
add('plank-shoulder-tap', { name: 'High Plank Shoulder Tap', cat: 'Core', gear: 'Bodyweight', muscles: ['Abs', 'Shoulders'], targets: T.core, fig: 'plank', perSide: true,
  steps: ['Start in a high plank, feet a bit wide.', 'Tap one shoulder with the opposite hand.', 'Keep your hips still and alternate.'], tip: 'Wider feet make it easier to stay steady.' });
add('mountain-climber', { name: 'Mountain Climber (Slow)', cat: 'Core', gear: 'Bodyweight', muscles: ['Abs', 'Hip flexors'], targets: T.core, fig: 'plank', perSide: true,
  steps: ['Start in a high plank.', 'Drive one knee toward your chest, then switch legs.', 'Keep it slow and controlled.'], tip: 'Slow is harder than fast. No bouncing.' });

// ---------------------------------------------------------------------------------------------------------------- LEGS
add('bodyweight-squat', { name: 'Bodyweight Squat', cat: 'Legs', gear: 'Bodyweight', muscles: ['Quads', 'Glutes', 'Hamstrings'], targets: T.legsGlutes, fig: 'tempo-squat',
  steps: ['Feet shoulder-width apart, toes slightly out.', 'Sit your hips back and down, keeping your chest up and your heels flat.', 'Push through your whole foot to stand.'], tip: 'Knees track in line with your toes. Go as low as is comfortable.' });
add('box-squat', { name: 'Box / Chair Squat', cat: 'Legs', gear: 'Bench', muscles: ['Quads', 'Glutes'], targets: T.legsGlutes, fig: 'box-squat',
  steps: ['Stand in front of a bench or chair, feet shoulder-width apart.', 'Sit back until you lightly touch it. Do not drop onto it.', 'Stand up by pushing through your feet.'], tip: 'The box gives you a target depth and builds confidence.' });
add('supported-squat', { name: 'Supported Squat (Rack or TRX)', cat: 'Legs', gear: 'Other', muscles: ['Quads', 'Glutes'], targets: T.legsGlutes, fig: 'tempo-squat',
  steps: ['Hold a rack or TRX straps with straight arms.', 'Sit back and down, using your arms only for balance.', 'Stand up, pushing through your feet.'], tip: 'Use your legs to do the work. The support is only for balance.' });
add('goblet-squat', { name: 'Goblet Squat', cat: 'Legs', gear: 'Dumbbell', muscles: ['Quads', 'Glutes', 'Core'], targets: T.legsGlutes, fig: 'goblet-squat',
  steps: ['Hold one dumbbell against your chest with both hands.', 'Squat down between your knees, chest up.', 'Stand up by pushing through your feet.'], tip: 'Holding the weight in front helps you sit upright.' });
add('goblet-box-squat', { name: 'Goblet Squat to Box', cat: 'Legs', gear: 'Dumbbell', muscles: ['Quads', 'Glutes'], targets: T.legsGlutes, fig: 'goblet-squat',
  steps: ['Stand in front of a box holding a light dumbbell at your chest.', 'Sit back until you lightly touch the box.', 'Stand up, pushing through your feet.'], tip: 'Keep the weight light and the pace controlled.' });
add('supported-split-squat', { name: 'Supported Split Squat', cat: 'Legs', gear: 'Bodyweight', muscles: ['Quads', 'Glutes'], targets: T.legsGlutes, fig: 'split-db', perSide: true,
  steps: ['Hold a support and step one foot back into a split stance.', 'Lower your back knee toward the floor, front shin vertical.', 'Press up. Then switch legs.'], tip: 'Stay pain-free. A shorter range is fine.' });
add('leg-press', { name: 'Leg Press', cat: 'Legs', gear: 'Machine', muscles: ['Quads', 'Glutes', 'Hamstrings'], targets: T.legsGlutes, fig: 'leg-press',
  steps: ['Sit with your back flat on the pad and feet shoulder-width on the platform.', 'Lower the platform until your knees reach about 90°.', 'Press back up without locking your knees.'], tip: 'Do not let your lower back lift off the pad.' });
add('leg-extension', { name: 'Leg Extension (Machine)', cat: 'Legs', gear: 'Machine', muscles: ['Quads'], targets: T.legs, fig: 'leg-ext',
  steps: ['Sit with your knees lined up with the pivot and the pad on your shins.', 'Straighten your legs, squeezing your quads.', 'Lower slowly.'], tip: 'Do not swing. Pause for one second at the top.' });
add('rdl', { name: 'Romanian Deadlift (RDL)', cat: 'Legs', gear: 'Dumbbell', muscles: ['Hamstrings', 'Glutes', 'Lower back'], targets: T.legsGlutes, fig: 'rdl-db',
  steps: ['Stand holding light dumbbells in front of your thighs, soft knees.', 'Push your hips back, sliding the weights down your legs, back flat.', 'Squeeze your glutes to stand tall.'], tip: 'Hinge at the hips. Stop when you feel a hamstring stretch.' });
add('db-rdl', { name: 'Dumbbell RDL', cat: 'Legs', gear: 'Dumbbell', muscles: ['Hamstrings', 'Glutes'], targets: T.legsGlutes, fig: 'rdl-db',
  steps: ['Dumbbells in front of your thighs, soft knees.', 'Push your hips back with a flat back as the weights slide down.', 'Stand tall by squeezing your glutes.'], tip: 'Keep the dumbbells close to your legs.' });
add('kb-deadlift', { name: 'Kettlebell Deadlift (Raised)', cat: 'Legs', gear: 'Kettlebell', muscles: ['Hamstrings', 'Glutes', 'Back'], targets: T.legsGlutes, fig: 'trap-deadlift',
  steps: ['Stand over a kettlebell on a low block, feet hip-width.', 'Hinge down with a flat back and grip the handle.', 'Stand tall by pushing your hips forward.'], tip: 'Raised blocks reduce the depth for an easier start.' });
add('cable-pull-through', { name: 'Cable Pull-Through', cat: 'Glutes', gear: 'Cable', muscles: ['Glutes', 'Hamstrings'], targets: T.glutes, fig: 'pull-through',
  steps: ['Face away from a low cable with a rope between your legs.', 'Hinge back, then drive your hips forward to stand.', 'Squeeze your glutes at the top.'], tip: 'It is a hip hinge. Your arms are just hooks.' });
add('leg-curl', { name: 'Leg Curl (Seated or Lying)', cat: 'Legs', gear: 'Machine', muscles: ['Hamstrings'], targets: T.legs, fig: 'leg-curl-seated',
  steps: ['Adjust the pad just above your heels and the pivot to your knees.', 'Curl your heels toward your glutes.', 'Return slowly.'], tip: 'Keep your hips still and move slowly.' });
add('lying-leg-curl', { name: 'Lying Leg Curl', cat: 'Legs', gear: 'Machine', muscles: ['Hamstrings'], targets: T.legs, fig: 'leg-curl-lying',
  steps: ['Lie face down with the pad above your heels.', 'Curl your heels toward your glutes.', 'Lower slowly.'], tip: 'Keep your hips pressed into the bench.' });
add('seated-leg-curl', { name: 'Seated Leg Curl', cat: 'Legs', gear: 'Machine', muscles: ['Hamstrings'], targets: T.legs, fig: 'leg-curl-seated',
  steps: ['Sit with the pad above your heels and the thigh pad snug.', 'Curl your heels back and under the seat.', 'Return slowly.'], tip: 'Use a smooth tempo. No bouncing at the end.' });
add('band-leg-curl', { name: 'Band Leg Curl', cat: 'Legs', gear: 'Band', muscles: ['Hamstrings'], targets: T.legs, fig: 'band-leg-curl',
  steps: ['Lie face down with a band around your ankles, anchored in front.', 'Curl your heels toward your glutes.', 'Return slowly.'], tip: 'Keep your hips on the floor.' });
add('ball-leg-curl', { name: 'Stability-Ball Leg Curl', cat: 'Legs', gear: 'Other', muscles: ['Hamstrings', 'Glutes'], targets: T.legsGlutes, fig: 'slider-curl',
  steps: ['Lie on your back with your heels on a ball and hips lifted.', 'Roll the ball toward you by bending your knees.', 'Roll it back out slowly.'], tip: 'Keep your hips high. This is harder than it looks, so start with small reps.' });
add('glute-bridge', { name: 'Floor Glute Bridge', cat: 'Glutes', gear: 'Bodyweight', muscles: ['Glutes', 'Hamstrings', 'Core'], targets: T.glutes, fig: 'glute-bridge',
  steps: ['Lie on your back, knees bent, feet flat and hip-width.', 'Squeeze your glutes and lift your hips until your body is in a line from knees to shoulders.', 'Hold for 1–2 seconds, then lower slowly.'], tip: 'Tuck your chin slightly and do not arch your lower back.' });
add('banded-bridge', { name: 'Banded Glute Bridge', cat: 'Glutes', gear: 'Band', muscles: ['Glutes'], targets: T.glutes, fig: 'banded-bridge',
  steps: ['Place a band just above your knees and lie with knees bent.', 'Press your knees out against the band as you lift your hips.', 'Hold, then lower slowly.'], tip: 'Keep your knees tracking over your toes.' });
add('hip-thrust', { name: 'Hip Thrust (Bench)', cat: 'Glutes', gear: 'Bench', muscles: ['Glutes', 'Hamstrings'], targets: T.glutes, fig: 'hip-thrust-machine',
  steps: ['Sit on the floor with your upper back against a bench, knees bent.', 'Drive your hips up until your body is in a line from knees to shoulders.', 'Pause, then lower slowly.'], tip: 'Chin tucked, ribs down. Squeeze your glutes at the top.' });
add('step-up', { name: 'Step-Up (Low Box)', cat: 'Legs', gear: 'Bench', muscles: ['Quads', 'Glutes'], targets: T.legsGlutes, fig: 'step-up', perSide: true,
  steps: ['Stand facing a low box (6–12 inches), one foot fully on top.', 'Push through the heel on the box to stand up.', 'Step back down slowly, then switch legs.'], tip: 'Do not push off the back foot. Torso tall.' });
add('reverse-lunge', { name: 'Reverse Lunge', cat: 'Legs', gear: 'Bodyweight', muscles: ['Quads', 'Glutes'], targets: T.legsGlutes, fig: 'reverse-lunge', perSide: true,
  steps: ['Stand tall, then step one foot back.', 'Lower until both knees are about 90°.', 'Push through your front heel to return. Alternate legs.'], tip: 'Hold a wall or rail at first if you are unsteady.' });
add('supported-reverse-lunge', { name: 'Supported Reverse Lunge', cat: 'Legs', gear: 'Bodyweight', muscles: ['Quads', 'Glutes'], targets: T.legsGlutes, fig: 'reverse-lunge', perSide: true,
  steps: ['Hold a rail or wall with one hand.', 'Step back and lower your back knee toward the floor.', 'Push through your front heel to return. Then switch legs.'], tip: 'Only go as low as feels pain-free.' });
add('bodyweight-split-squat', { name: 'Bodyweight Split Squat', cat: 'Legs', gear: 'Bodyweight', muscles: ['Quads', 'Glutes'], targets: T.legsGlutes, fig: 'split-db', perSide: true,
  steps: ['Stand in a long split stance, feet planted.', 'Lower your back knee toward the floor, chest tall.', 'Press up through your front foot. Then switch legs.'], tip: 'A longer stance puts more work in your glutes.' });
add('sit-to-stand', { name: 'Sit-to-Stand (Chair/Bench)', cat: 'Legs', gear: 'Bench', muscles: ['Quads', 'Glutes'], targets: T.legsGlutes, fig: 'sit-to-stand',
  steps: ['Sit on the edge of a chair with feet flat.', 'Lean forward slightly and stand up without using your hands.', 'Sit back down slowly.'], tip: 'The slow lowering phase is where you build strength.' });
add('calf-raise', { name: 'Calf Raise', cat: 'Legs', gear: 'Machine', muscles: ['Calves'], targets: T.legs, fig: 'calf-machine',
  steps: ['Stand with the balls of your feet on the platform, heels hanging off.', 'Rise as high as you can.', 'Lower slowly into a stretch.'], tip: 'Pause at the top and the bottom. Full range matters most.' });
add('seated-calf-raise', { name: 'Seated Calf Raise (Machine)', cat: 'Legs', gear: 'Machine', muscles: ['Calves (soleus)'], targets: T.legs, fig: 'calf-machine',
  steps: ['Sit with the pad on your thighs and the balls of your feet on the platform.', 'Rise up onto your toes.', 'Lower slowly below the platform.'], tip: 'Bent knees work the deeper calf muscle (soleus).' });
add('standing-calf-raise', { name: 'Standing Calf Raise (with Support)', cat: 'Legs', gear: 'Bodyweight', muscles: ['Calves'], targets: T.legs, fig: 'calf-step',
  steps: ['Stand at a wall or rail on the edge of a step.', 'Rise onto your toes.', 'Lower your heels below the step slowly.'], tip: 'Hold the support lightly. Do not lean on it.' });
add('leg-press-calf-raise', { name: 'Leg Press Calf Raise', cat: 'Legs', gear: 'Machine', muscles: ['Calves'], targets: T.legs, fig: 'calf-press',
  steps: ['Sit in the leg press with the balls of your feet on the lower platform edge.', 'Press your toes forward, keeping your legs straight.', 'Return slowly into a stretch.'], tip: 'Do not lock your knees hard.' });

// ---------------------------------------------------------------------------------------------------------------- CARDIO / CONDITIONING
const cardioStep = ['Settle into a pace where you can still hold a conversation.', 'Stand or sit tall and relax your shoulders.', 'Keep breathing smoothly for the whole time.'];
add('treadmill-walk', { name: 'Treadmill Walk', cat: 'Cardio', gear: 'Machine', muscles: ['Heart', 'Legs'], targets: T.legs, unit: 'min', steps: cardioStep, tip: 'A small incline makes the same speed work a little harder.' });
add('stationary-bike', { name: 'Cycling (Stationary Bike)', cat: 'Cardio', gear: 'Machine', muscles: ['Heart', 'Quads'], targets: T.legs, unit: 'min', steps: cardioStep, tip: 'Set the saddle so your knee is slightly bent at the bottom.' });
add('elliptical', { name: 'Elliptical (Cross Trainer)', cat: 'Cardio', gear: 'Machine', muscles: ['Heart', 'Legs'], targets: T.legs, unit: 'min', steps: cardioStep, tip: 'Easy on the joints. Hold the moving handles to include your arms.' });
add('rowing-machine', { name: 'Rowing Machine', cat: 'Cardio', gear: 'Machine', muscles: ['Heart', 'Back', 'Legs'], targets: ['back', 'legs'], unit: 'min', steps: ['Push with your legs first, then lean back, then pull with your arms.', 'Return in the reverse order: arms, body, then knees.', 'Keep a smooth, easy rhythm.'], tip: 'Legs do most of the work. Start light.' });
add('brisk-walk', { name: 'Brisk Walking (Outdoor)', cat: 'Cardio', gear: 'Bodyweight', muscles: ['Heart', 'Legs'], targets: T.legs, unit: 'min', steps: cardioStep, tip: 'Swing your arms and walk a little faster than comfortable chatting pace.' });
add('bw-circuit', { name: 'Bodyweight Circuit', cat: 'Cardio', gear: 'Bodyweight', muscles: ['Full body'], targets: ['legs', 'chest', 'core'], unit: 'min', steps: ['Do 10 squats, 8 push-ups (any version) and a 20-second plank.', 'Rest 30–45 seconds, then repeat as one round.', 'Aim for 3–4 smooth rounds.'], tip: 'Pick versions you can do with good form, then keep them the same each week.' });
add('kb-circuit', { name: 'Kettlebell Circuit (Light)', cat: 'Cardio', gear: 'Kettlebell', muscles: ['Full body'], targets: ['legs', 'back', 'glutes'], unit: 'min', steps: ['Goblet squat x10, deadlift x10, farmer hold 20 seconds.', 'Rest 30–45 seconds, then repeat.', 'Keep the weight light and your back flat.'], tip: 'Master the hinge before you swing.' });
add('battle-rope', { name: 'Battle Rope (Light)', cat: 'Cardio', gear: 'Other', muscles: ['Shoulders', 'Core', 'Heart'], targets: ['shoulders', 'core'], unit: 'min', steps: ['Stand with soft knees, a rope end in each hand.', 'Make alternating waves for 20 seconds.', 'Rest 40 seconds and repeat.'], tip: 'Hips back, chest up. Use your whole body, not just your arms.' });
add('med-ball-circuit', { name: 'Medicine Ball Circuit (Slam / Toss)', cat: 'Cardio', gear: 'Other', muscles: ['Full body'], targets: ['core', 'shoulders'], unit: 'min', steps: ['Lift a light ball overhead and slam it to the floor, 8 reps.', 'Do 8 chest passes to a wall (or a partner).', 'Rest 30–45 seconds, then repeat.'], tip: 'Use a soft or light ball and keep your core tight.' });
add('hiit-low', { name: 'HIIT (Low Impact)', cat: 'Cardio', gear: 'Bodyweight', muscles: ['Heart', 'Full body'], targets: ['legs', 'core'], unit: 'min', steps: ['Work for 20 seconds at a hard but doable pace (bike, march, or step jacks).', 'Rest 40 seconds.', 'Repeat for the planned time.'], tip: 'Low-impact means no jumping. Intensity comes from effort, not impact.' });

export const EXERCISES: Record<string, Exercise> = E;
export const exerciseList = (): Exercise[] => Object.values(E);
export const getEx = (id: string): Exercise | undefined => E[id];

// ---------------------------------------------------------------------------------------------------------------- DAYS
export type PlanItem = { ex: string; sets: number; reps: string; restSec: number; alts: string[]; note?: string };
export type DayKind = 'strength' | 'active' | 'conditioning' | 'rest';
export type DayWay = { items: PlanItem[]; minutes: number; note: string };
export type PlanDay = {
  n: number;            // 1..7, the same as the weekday (Mon = 1)
  key: string;
  short: string;        // "Upper A"
  title: string;        // "Upper Body A"
  focus: string;        // "Chest, Back, Shoulders, Arms"
  kind: DayKind;
  items: PlanItem[];
  targets: { label: string; note: string; fig: string[] }[]; // "Muscles targeted" tiles
  minutes: [number, number];
  met: number;          // for the calorie estimate
  intro: string;
  // Set only on days built from the server's Smart program (utils/smartPlan.ts):
  smart?: boolean; sessionId?: string; date?: string; note?: string; shifted?: boolean; missed?: boolean;
  /** Smart strength days: the same day done another way, and the plan's OWN warm-up and cool-down lists (plain sentences). */
  ways?: Partial<Record<'home' | 'quick', DayWay>>; warmup?: string[]; cooldown?: string[];
};
const it = (ex: string, sets: number, reps: string, restSec: number, alts: string[], note?: string): PlanItem => ({ ex, sets, reps, restSec, alts, note });

export const DAYS: PlanDay[] = [
  { n: 1, key: 'upperA', short: 'Upper A', title: 'Upper Body A', focus: 'Chest, Back, Shoulders, Arms, Core', kind: 'strength', minutes: [45, 60], met: 4.0,
    intro: 'Push and pull evenly. Light weights, clean form.',
    targets: [{ label: 'Chest', note: 'Light', fig: ['chest'] }, { label: 'Back', note: 'Mid back & lats', fig: ['back'] }, { label: 'Shoulders', note: 'Delts', fig: ['shoulders'] }, { label: 'Arms', note: 'Biceps / Triceps', fig: ['arms'] }],
    items: [
      it('incline-pushup', 3, '8-12', 75, ['wall-pushup', 'chest-press-machine', 'db-floor-press', 'knee-pushup']),
      it('seated-cable-row', 3, '10-12', 75, ['chest-supported-row', 'band-row', 'one-arm-db-row', 'supported-tbar-row']),
      it('db-shoulder-press', 3, '10-12', 75, ['shoulder-press-machine', 'neutral-db-press', 'landmine-press', 'band-press']),
      it('lateral-raise', 2, '12-15', 60, ['cable-lateral-raise', 'machine-lateral-raise', 'leaning-lateral-raise', 'band-lateral-raise']),
      it('db-biceps-curl', 2, '10-12', 60, ['hammer-curl', 'cable-curl', 'preacher-curl-machine', 'band-curl']),
      it('triceps-pushdown', 2, '10-12', 60, ['band-pressdown', 'overhead-cable-ext', 'close-grip-machine-press', 'assisted-dip']),
      it('dead-bug', 2, '8-10', 45, ['heel-taps', 'bird-dog', 'bent-knee-march', 'short-lever-dead-bug']),
    ] },
  { n: 2, key: 'lowerA', short: 'Lower A', title: 'Lower Body A', focus: 'Quads, Hamstrings, Glutes, Calves, Core', kind: 'strength', minutes: [45, 60], met: 4.5,
    intro: 'Build the base: squat, press, hinge, bridge.',
    targets: [{ label: 'Quads', note: 'Front thigh', fig: ['legs'] }, { label: 'Glutes', note: 'Hips', fig: ['glutes'] }, { label: 'Hamstrings', note: 'Back thigh', fig: ['legs'] }, { label: 'Core', note: 'Abs & back', fig: ['core'] }],
    items: [
      it('bodyweight-squat', 3, '10-12', 75, ['box-squat', 'supported-squat', 'goblet-squat']),
      it('leg-press', 3, '10-12', 90, ['goblet-box-squat', 'box-squat', 'supported-split-squat']),
      it('rdl', 3, '10-12', 90, ['db-rdl', 'kb-deadlift', 'cable-pull-through', 'glute-bridge']),
      it('leg-curl', 2, '10-12', 60, ['lying-leg-curl', 'seated-leg-curl', 'band-leg-curl', 'ball-leg-curl']),
      it('glute-bridge', 3, '10-12', 60, ['banded-bridge', 'hip-thrust', 'cable-pull-through']),
      it('step-up', 2, '8-10', 60, ['supported-reverse-lunge', 'bodyweight-split-squat', 'sit-to-stand']),
      it('calf-raise', 3, '12-15', 45, ['seated-calf-raise', 'standing-calf-raise', 'leg-press-calf-raise']),
      it('plank', 3, '20-40', 45, ['elevated-plank', 'dead-bug', 'bird-dog', 'side-plank']),
    ] },
  { n: 3, key: 'active', short: 'Active', title: 'Active Recovery', focus: 'Low-impact cardio, mobility, light core', kind: 'active', minutes: [30, 40], met: 3.5,
    intro: 'Move easy to recover. You should finish feeling better than you started.',
    targets: [{ label: 'Heart', note: 'Easy pace', fig: [] }, { label: 'Hips', note: 'Mobility', fig: ['glutes'] }, { label: 'Spine', note: 'Mobility', fig: ['back'] }, { label: 'Core', note: 'Light', fig: ['core'] }],
    items: [
      it('treadmill-walk', 1, '20-30', 0, ['stationary-bike', 'elliptical', 'rowing-machine', 'brisk-walk']),
      it('bird-dog', 2, '8-10', 45, ['dead-bug', 'plank-shoulder-tap', 'elbow-knee-plank']),
    ] },
  { n: 4, key: 'upperB', short: 'Upper B', title: 'Upper Body B', focus: 'Chest, Back, Rear Delts, Arms, Core', kind: 'strength', minutes: [45, 60], met: 4.0,
    intro: 'A second pass at the upper body from different angles.',
    targets: [{ label: 'Chest', note: 'Light', fig: ['chest'] }, { label: 'Back', note: 'Width', fig: ['back'] }, { label: 'Rear Delt', note: 'Posture', fig: ['shoulders'] }, { label: 'Arms', note: 'Biceps / Triceps', fig: ['arms'] }],
    items: [
      it('chest-press-machine', 3, '10-12', 75, ['db-floor-press', 'incline-pushup', 'db-bench-press', 'cable-chest-press']),
      it('lat-pulldown', 3, '10-12', 75, ['assisted-pullup', 'neutral-pulldown', 'band-pulldown', 'straight-arm-pulldown']),
      it('seated-db-press', 3, '10-12', 75, ['shoulder-press-machine', 'arnold-press', 'landmine-press', 'band-press']),
      it('face-pull', 2, '12-15', 60, ['rev-pec-deck', 'band-pull-apart', 'rear-delt-fly', 'cable-rear-row']),
      it('hammer-curl', 2, '10-12', 60, ['supinated-curl', 'cable-hammer-curl', 'crossbody-hammer-curl', 'band-hammer-curl']),
      it('overhead-triceps-ext', 2, '10-12', 60, ['rope-pushdown', 'band-overhead-ext', 'single-db-overhead-ext', 'closegrip-pushup']),
      it('russian-twist', 2, '12-16', 45, ['pallof-press', 'seated-band-rotation', 'bicycle-crunch', 'standing-cable-rotation']),
    ] },
  { n: 5, key: 'lowerB', short: 'Lower B', title: 'Lower Body B', focus: 'Quads, Hamstrings, Glutes, Calves, Core', kind: 'strength', minutes: [45, 60], met: 4.5,
    intro: 'Same muscles, new moves: more glutes and single-leg work.',
    targets: [{ label: 'Quads', note: 'Front thigh', fig: ['legs'] }, { label: 'Glutes', note: 'Hips', fig: ['glutes'] }, { label: 'Hamstrings', note: 'Back thigh', fig: ['legs'] }, { label: 'Calves', note: 'Lower leg', fig: ['legs'] }],
    items: [
      it('goblet-squat', 3, '10-12', 75, ['box-squat', 'bodyweight-squat', 'supported-squat', 'leg-press']),
      it('db-rdl', 3, '10-12', 90, ['rdl', 'kb-deadlift', 'cable-pull-through', 'glute-bridge']),
      it('hip-thrust', 3, '10-12', 75, ['glute-bridge', 'banded-bridge', 'cable-pull-through']),
      it('leg-extension', 2, '12-15', 60, ['bodyweight-split-squat', 'sit-to-stand', 'supported-split-squat']),
      it('seated-leg-curl', 2, '10-12', 60, ['lying-leg-curl', 'band-leg-curl', 'ball-leg-curl']),
      it('reverse-lunge', 2, '8-10', 60, ['supported-reverse-lunge', 'step-up', 'bodyweight-split-squat']),
      it('standing-calf-raise', 3, '12-15', 45, ['seated-calf-raise', 'calf-raise', 'leg-press-calf-raise']),
      it('side-plank', 2, '15-30', 45, ['plank', 'elevated-plank', 'dead-bug', 'bird-dog']),
    ] },
  { n: 6, key: 'conditioning', short: 'Conditioning', title: 'Conditioning', focus: 'Full-body circuit, heart health, core', kind: 'conditioning', minutes: [30, 40], met: 6.0,
    intro: 'Short bursts, easy rests. Keep it low-impact and stay smooth.',
    targets: [{ label: 'Heart', note: 'Intervals', fig: [] }, { label: 'Legs', note: 'Squat pattern', fig: ['legs'] }, { label: 'Upper', note: 'Push pattern', fig: ['chest'] }, { label: 'Core', note: 'Stability', fig: ['core'] }],
    items: [
      it('bw-circuit', 1, '12-15', 0, ['kb-circuit', 'battle-rope', 'med-ball-circuit', 'hiit-low']),
      it('treadmill-walk', 1, '10-15', 0, ['stationary-bike', 'elliptical', 'rowing-machine', 'brisk-walk']),
      it('plank', 2, '20-40', 45, ['elbow-knee-plank', 'plank-shoulder-tap', 'dead-bug', 'mountain-climber']),
    ] },
  { n: 7, key: 'rest', short: 'Rest', title: 'Rest & Recover', focus: 'Full rest, optional gentle mobility', kind: 'rest', minutes: [0, 15], met: 2.5,
    intro: 'Muscles grow while you rest. A short walk or gentle mobility is plenty.',
    targets: [], items: [] },
];

// ONE plan at a time: the Classic 7-day plan above, or the server's Smart program (utils/smartPlan.ts) when it is usable and chosen.
// Every screen asks for days through activeDays()/dayByNumber(), so Today, the day overview, the live workout and History always agree.
let ACTIVE: PlanDay[] | null = null;
export function setActiveDays(days: PlanDay[] | null) { ACTIVE = days && days.length === 7 ? days : null; }
export const activeDays = (): PlanDay[] => ACTIVE || DAYS;
export const isSmartActive = () => !!ACTIVE;
export const dayByNumber = (n: number): PlanDay => activeDays()[Math.max(0, Math.min(6, n - 1))];

/** Adds an exercise the built-in library does not have (the server's Smart program has its own ids). Never replaces one that exists. */
export function registerExercise(ex: Exercise) { if (ex && ex.id && !E[ex.id]) E[ex.id] = ex; }
/** Monday = 1 ... Sunday = 7 for a 'YYYY-MM-DD' string (local date, no timezone surprises). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(y, (m || 1) - 1, d || 1).getDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}
export const dayForDate = (date: string): PlanDay => dayByNumber(weekdayOf(date));

export const PLAN_META = {
  id: 'lean-toned-7',
  name: '7-Day Lean & Toned Plan',
  level: 'Beginner',
  perWeek: '7 days / week',
  blurb: 'A balanced week of upper body, lower body, recovery and conditioning.',
  goals: ['Build base strength', 'Lose body fat', 'Improve fitness', 'Beginner friendly'],
  rules: [
    { k: 'Warm-up', v: '5–8 min' }, { k: 'Sets', v: '2–3 each' }, { k: 'Reps', v: '8–15' }, { k: 'Rest', v: '60–120 s' },
  ],
  safety: [
    'Use a comfortable, pain-free range. Quality beats depth.',
    'Stop if you feel sharp pain and choose an easier option.',
    'Keep 2–3 reps in reserve. Do not train to failure.',
    'Progress gradually: add reps first, then a little weight, then more sets.',
    'Be consistent for 8–12 weeks before judging results.',
  ],
};

// ---------------------------------------------------------------------------------------------------------------- WARM-UP / COOL-DOWN / MOBILITY
export type Routine = { id: string; name: string; detail: string; alts: string[] };
const r = (id: string, name: string, detail: string, alts: string[]): Routine => ({ id, name, detail, alts });

export const WARMUP: Routine[] = [
  r('w1', 'Treadmill / Brisk Walk / Cycle', '3–5 min easy pace to raise your heart rate', ['Brisk Walk (Outdoors)', 'Stationary Bike', 'Elliptical (Cross Trainer)', 'Rowing (Light Pace)']),
  r('w2', 'Arm Circles', 'Arms out to the sides, small to big circles, 20 sec each direction', ['Arm Swings (Front-Back)', 'Cross-Body Arm Swings', 'Hand Circles (Wrists)', 'Shoulder Taps (Alternate)']),
  r('w3', 'Shoulder Rolls', 'Roll your shoulders slowly and controlled for 20 sec', ['Shoulder Shrugs (Up & Down)', 'Scapular Retraction (Squeeze Back)', 'Shoulder Circles (Forward & Back)', 'Arm Crosses (Chest Open)']),
  r('w4', 'Scapular Push-up', 'Arms straight, move only your shoulder blades, 8–12 reps', ['Wall Scapular Push-up', 'Quadruped Scapular Protraction', 'Band Scapular Retraction', 'Seated Scapular Squeeze']),
  r('w5', 'Hip Circles', 'Hands on hips, circle slowly, 10 each direction', ['Hip Hinge (Wall Touch)', 'Pelvic Tilts (Standing)', 'Hip CARs (Controlled Rotations)', 'March in Place (High Knees – Low)']),
  r('w6', 'Leg Swings (Front/Back & Side)', 'Hold support, swing gently: 10 each front/back, 10 each side', ['Leg March (High Knee)', 'Butt Kick (Mild)', 'Lateral Leg Raise (Bodyweight)', 'Hip Opener (Knee Out)']),
  r('w7', 'Bodyweight Squat', 'Feet shoulder-width, sit back, chest up, 10–15 reps', ['Half Squat (Short Range)', 'Box Squat (To Chair)', 'Sit-to-Stand (Chair)', 'Goblet Squat (Light Weight)']),
  r('w8', 'Band Pull-Apart', 'Band at chest height, pull apart, squeeze shoulder blades, 10–15 reps', ['Towel Pull-Apart (Without Band)', 'Reverse Fly (Light DB)', 'Face Pull (Band/Cable)', 'Wall Slide (Scapular Control)']),
];
export const COOLDOWN: Routine[] = [
  r('c1', 'Slow Walk / Breathing', '2–5 min easy walk. Breathe in for 4, out for 4', ['Light Cycling', 'Treadmill (Low)', 'March in Place', 'Box Breathing (4-4-4-4)']),
  r('c2', 'Chest Stretch', 'Open the chest and shoulders. Hold 20–30 sec each side', ['Doorway Stretch', 'Corner Stretch', 'Wall Chest Stretch', 'Pec Stretch (Arm Behind Back)']),
  r('c3', 'Shoulder Stretch', 'Pull one arm across your chest. Hold 20–30 sec each side', ['Overhead Shoulder Stretch', 'Cross-Body Stretch (with Towel)', 'Sleeper Stretch (Gentle)', 'Wall Shoulder Stretch']),
  r('c4', 'Triceps Stretch', 'Bend your elbow overhead and gently pull. Hold 20–30 sec', ['Towel Triceps Stretch', 'Cross-Body Triceps Pull', 'Wall Triceps Stretch', 'Overhead Triceps with Band']),
  r('c5', 'Quad Stretch', 'Stand and hold your ankle, knees together. Hold 20–30 sec', ['Side-Lying Quad Stretch', 'Kneeling Quad Stretch (Half Kneel)', 'Standing Quad (with Support)', 'Couch Stretch (Advanced)']),
  r('c6', 'Hamstring Stretch', 'Back straight, reach toward your toes. Hold 20–30 sec', ['Standing Hamstring (Hinge)', 'Straight-Leg Reach (Sitting)', 'Towel Hamstring Stretch (Lying)', 'Wall Hamstring (Leg on Wall)']),
  r('c7', 'Glute Stretch', 'Lie down, cross one knee, pull toward the opposite side. Hold 20–30 sec', ['Figure-4 Stretch (Lying)', 'Seated Figure-4 Stretch', 'Pigeon Stretch (Gentle)', 'Knee-to-Chest (Single Leg)']),
  r('c8', 'Calf Stretch', 'Step one leg back, heel on the ground. Hold 20–30 sec', ['Straight-Knee Calf (Wall)', 'Bent-Knee Calf (Wall)', 'Stair Calf Stretch (Heel Drop)', 'Calf Stretch (with Towel)']),
  r('c9', 'Lat Stretch', 'Kneel, push your hips back, chest toward the floor. Hold 20–30 sec', ['Doorway Lat Stretch', 'Wall Lat Stretch (Arms Up)', 'Side Bend Stretch (Standing)', 'Bar Hang (Gentle, 10–20 s)']),
];
export const MOBILITY: Routine[] = [
  r('m1', 'Cat-Cow', 'Slowly round and arch your back on hands and knees', ['Seated Cat-Cow', 'Standing Cat-Cow (Hands on Thighs)', "Child's Pose to Cobra Flow"]),
  r('m2', 'Thoracic Rotation', 'Rotate your upper back, keeping your hips still', ['Open Book (Lying)', 'Thread the Needle', 'Seated Trunk Rotation']),
  r('m3', 'Ankle Mobility', 'Gently rock your knee over your toes', ['Ankle Circles', 'Wall Ankle Dorsiflexion', 'Heel-Toe Rocks']),
  r('m4', "Child's Pose", 'Sit back onto your heels with arms forward and breathe', ["Extended Child's Pose (Arms Forward)", "Child's Pose with Side Reach", 'Kneeling Back Stretch']),
  r('m5', 'Full-Body Gentle Stretch', 'Reach, bend and breathe. Nothing forced', ["World's Greatest Stretch (Dynamic)", 'Standing Reach & Side Bend', 'Hamstring + Calf Flow']),
];
export const MOBILITY_OPTIONS = [
  { id: 'A', name: 'Option A · Full body', steps: ['Cat-Cow', 'Hip Opener', 'Thoracic Rotation', 'Ankle Mobility'] },
  { id: 'B', name: 'Option B · Upper focus', steps: ['Shoulder CARs', 'Scapular Wall Slide', 'Chest Opener', 'T-Spine Rotation'] },
  { id: 'C', name: 'Option C · Lower focus', steps: ['Hip Circles', '90/90 Hip Stretch', 'Hamstring Flow', 'Ankle Rocks'] },
];
