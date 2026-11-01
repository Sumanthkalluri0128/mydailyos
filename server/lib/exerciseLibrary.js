// Exercise library for the Body plan training program. Pure data + ranking, no database.
//
// Every exercise belongs to one or more MOVEMENT SLOTS (squat, hinge, horizontal press, ...). A session is a list of slots; the
// ranking below picks the exercise for each slot that suits THIS person (their level, size, age, limits, where they train and what
// equipment they own), and the swap logic offers the next best options when a machine is busy, missing, or the person is at home.
//
// Tags (used by the ranking, never shown as-is):
//   machine / cable / free / bw / band   what it is, used to offer a different KIND of swap
//   joint     kind to joints: stable, guided or low load. Preferred for heavier bodies and older lifters
//   tall      works well for long thigh bones and long arms (leg press, hack squat, box squat, trap bar, cable work)
//   short     works well for shorter limbs (goblet squat, floor press, push-ups, barbell lifts)
//   heavy     can be loaded heavily (good for lighter frames that need real loading, and for muscle-first goals)
//   heavyBar  big barbell lift: needs skill, a rack or a spotter. Not for beginners, older lifters or the heart limit
//   glute     biases the glutes (preferred for women's shapes and a glute focus)
//   uni       one side at a time        balance  needs balance        hold  timed hold         power  explosive
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const PLACES = ['gym', 'home', 'both'];
// Things that make some moves a poor idea. 'heart' = a heart or blood-pressure condition (machines and light work only).
const LIMITS = ['knee', 'back', 'shoulder', 'wrist', 'elbow', 'heart'];
// What the person has at home. Bodyweight, a chair or step, a backpack and water bottles are always assumed.
const HOME_EQUIP = ['dumbbells', 'bands', 'bench', 'pullupbar', 'kettlebell'];
const GYM_TOKENS = new Set(['dumbbells', 'bench', 'pullupbar', 'kettlebell']); // bands are not assumed at a gym
const FOCUS = ['glutes', 'shoulders', 'arms', 'chest', 'back', 'legs', 'core'];

// role: compound moves are done first and heavier; isolation moves finish the muscle. main = full set credit, aux = half.
const SLOTS = {
  squat: { label: 'Squat', role: 'compound', main: ['legs', 'glutes'], aux: ['core'] },
  hinge: { label: 'Hip hinge', role: 'compound', main: ['glutes', 'legs'], aux: ['back'] },
  lunge: { label: 'Single-leg', role: 'compound', main: ['legs', 'glutes'], aux: ['core'] },
  glute: { label: 'Glutes', role: 'isolation', main: ['glutes'], aux: [] },
  quad: { label: 'Thighs (front)', role: 'isolation', main: ['legs'], aux: [] },
  ham: { label: 'Hamstrings', role: 'isolation', main: ['legs'], aux: ['glutes'] },
  calf: { label: 'Calves', role: 'isolation', main: ['legs'], aux: [] },
  hpress: { label: 'Chest press', role: 'compound', main: ['chest'], aux: ['shoulders', 'arms'] },
  ipress: { label: 'Upper-chest press', role: 'compound', main: ['chest'], aux: ['shoulders', 'arms'] },
  fly: { label: 'Chest fly', role: 'isolation', main: ['chest'], aux: [] },
  vpress: { label: 'Shoulder press', role: 'compound', main: ['shoulders'], aux: ['arms'] },
  lateral: { label: 'Side shoulders', role: 'isolation', main: ['shoulders'], aux: [] },
  rear: { label: 'Rear shoulders and upper back', role: 'isolation', main: ['shoulders', 'back'], aux: [] },
  tri: { label: 'Triceps', role: 'isolation', main: ['arms'], aux: [] },
  vpull: { label: 'Pull-down (lats)', role: 'compound', main: ['back'], aux: ['arms'] },
  hrow: { label: 'Row', role: 'compound', main: ['back'], aux: ['arms'] },
  bicep: { label: 'Biceps', role: 'isolation', main: ['arms'], aux: [] },
  core: { label: 'Core', role: 'isolation', main: ['core'], aux: [] },
};


// Plain form guidance per movement: how to set up, how to move, when to breathe, and the mistake to avoid. Shown under every picture.
const FORM = {
  squat: { setup: 'Feet about shoulder-width, toes turned out a little. Chest tall, eyes forward.', move: 'Sit down and back between your heels until your thighs are about parallel, then push the floor away.', breathe: 'In on the way down, out as you stand.', avoid: 'Knees caving in, heels lifting, or your chest dropping forward.' },
  hinge: { setup: 'Feet hip-width, soft knees, weight on the middle of your feet.', move: 'Push your hips back like closing a car door with them. Keep the weight close to your legs, then squeeze your glutes to stand.', breathe: 'In as you lower, out as you stand.', avoid: 'Rounding your lower back or turning it into a squat.' },
  lunge: { setup: 'Take a long step. Torso upright, front foot flat.', move: 'Lower straight down until the front thigh is about level, then push through the front heel to stand.', breathe: 'In down, out up.', avoid: 'Front knee drifting inside your toes or leaning far forward.' },
  glute: { setup: 'Feet flat, knees bent, ribs down.', move: 'Drive your hips up until your body is a straight line from knee to shoulder. Squeeze, pause one second, lower slowly.', breathe: 'Out as you lift, in as you lower.', avoid: 'Arching your lower back instead of squeezing your glutes.' },
  quad: { setup: 'Adjust the seat so your knees line up with the machine pivot.', move: 'Straighten the legs smoothly, pause, then lower for 2 to 3 seconds.', breathe: 'Out as you straighten.', avoid: 'Swinging or locking your knees hard at the top.' },
  ham: { setup: 'Pad just above your heels, hips pressed into the seat or bench.', move: 'Curl your heels toward your glutes, pause, then return slowly.', breathe: 'Out as you curl.', avoid: 'Lifting your hips or using a jerk to start.' },
  calf: { setup: 'Balls of your feet on the edge, heels free to drop.', move: 'Rise as high as you can, pause one second, then lower until you feel a stretch.', breathe: 'Out as you rise.', avoid: 'Bouncing at the bottom or cutting the range short.' },
  hpress: { setup: 'Shoulder blades pulled back and down, feet planted, hands just wider than your shoulders.', move: 'Lower to mid-chest under control, then press up and slightly back toward your face.', breathe: 'In as you lower, out as you press.', avoid: 'Flaring elbows straight out, bouncing off your chest, or lifting your hips.' },
  ipress: { setup: 'Back flat on the incline, shoulder blades pulled back, feet planted.', move: 'Lower toward your upper chest, then press up over your shoulders.', breathe: 'In down, out up.', avoid: 'Shrugging your shoulders toward your ears.' },
  fly: { setup: 'Chest tall, shoulders down, a soft bend in the elbows that stays the same.', move: 'Open your arms wide until you feel a stretch across your chest, then hug the air back together.', breathe: 'In as you open, out as you close.', avoid: 'Going so wide that your shoulders ache, or bending and straightening the elbows.' },
  vpress: { setup: 'Ribs down, glutes tight, hands just outside your shoulders, forearms vertical.', move: 'Press straight up until your arms are almost straight, then lower to shoulder height.', breathe: 'Out as you press.', avoid: 'Leaning back or shrugging at the top.' },
  lateral: { setup: 'Slight forward lean, a soft bend in the elbows, weights at your sides.', move: 'Raise your arms out to the sides to shoulder height, lead with your elbows, lower slowly.', breathe: 'Out as you raise.', avoid: 'Swinging your body or lifting above shoulder height.' },
  rear: { setup: 'Hinge forward with a flat back, arms hanging, neck long.', move: 'Pull your elbows out and back, squeezing between your shoulder blades, then lower slowly.', breathe: 'Out as you lift.', avoid: 'Using momentum or shrugging.' },
  tri: { setup: 'Elbows tucked in beside your ribs and still.', move: 'Straighten your elbows fully, squeeze, then let your hands rise slowly.', breathe: 'Out as you straighten.', avoid: 'Letting your elbows drift forward or swinging your shoulders.' },
  vpull: { setup: 'Chest tall, a small lean back, grip a little wider than your shoulders.', move: 'Pull your elbows down toward your ribs until the bar reaches your upper chest. Let your arms rise back up slowly.', breathe: 'Out as you pull.', avoid: 'Pulling behind your neck or swinging your whole body.' },
  hrow: { setup: 'Chest tall, shoulders down, a flat back, arms reaching forward.', move: 'Pull your elbows back past your ribs, squeeze your shoulder blades, then return with control.', breathe: 'Out as you pull.', avoid: 'Rounding your back or shrugging toward your ears.' },
  bicep: { setup: 'Elbows pinned beside your ribs, shoulders relaxed.', move: 'Curl up, squeeze for a moment, and lower for 2 to 3 seconds.', breathe: 'Out as you curl.', avoid: 'Swinging your back or letting your elbows move forward.' },
  core: { setup: 'Ribs down, lower back gently flat, neck long.', move: 'Move slowly and keep your belly tight the whole time. Quality beats speed.', breathe: 'Out on the effort. Never hold your breath.', avoid: 'Pulling on your neck or arching your lower back.' },
};

// x(id, name, slot(s), venue, equipment needed, difficulty 1-3, limits that rule it out, tags, how to do it)
const x = (id, name, slot, venue, eq, diff, avoid, tags, cue) => ({ id, name, slots: [].concat(slot), venue, eq, diff, avoid, tags: eq.includes('bands') ? [...tags, 'band'] : tags, cue });

const LIB = [
  // ---------------------------------------------------------------- legs: squat
  x('goblet-squat', 'Goblet squat (dumbbell)', 'squat', 'both', ['dumbbells'], 1, [], ['free', 'short', 'joint'], 'Hold one dumbbell at your chest. Sit down between your heels with your chest tall, then stand up.'),
  x('kb-goblet', 'Kettlebell goblet squat', 'squat', 'both', ['kettlebell'], 1, [], ['free', 'short', 'joint'], 'Hold the kettlebell by the sides at your chest, elbows inside your knees. Sit down, then stand up.'),
  x('leg-press', 'Leg press', ['squat', 'quad'], 'gym', [], 1, [], ['machine', 'tall', 'joint', 'heavy'], 'Feet shoulder-width on the middle of the platform. Lower until your knees are about 90 degrees with your hips on the seat. Do not lock your knees at the top.'),
  x('hack-squat', 'Hack squat machine', 'squat', 'gym', [], 1, ['knee'], ['machine', 'tall', 'heavy'], 'Back flat on the pad, feet forward on the plate. Lower under control and press through the whole foot.'),
  x('smith-squat', 'Smith machine squat', 'squat', 'gym', [], 2, ['heart'], ['machine', 'tall', 'heavy'], 'Feet a little in front of the bar so your shins stay upright. Sit down and back, then drive up.'),
  x('box-squat', 'Box squat (to a bench or chair)', 'squat', 'both', [], 1, [], ['bw', 'joint', 'tall'], 'Sit back to a sturdy bench or chair, touch it lightly without dropping onto it, then stand up. Hold a weight at your chest to make it harder.'),
  x('sit-to-stand', 'Sit-to-stand (high chair)', 'squat', 'both', [], 1, [], ['bw', 'joint'], 'Sit on the front of a sturdy chair, lean forward a little and stand up without pushing on your hands. Sit back down slowly.'),
  x('tempo-squat', 'Slow bodyweight squat (3 seconds down)', ['squat', 'quad'], 'both', [], 1, [], ['bw'], 'Take three seconds to go down, pause for one second at the bottom, then stand up. The slow tempo does the job of extra weight.'),
  x('backpack-squat', 'Backpack goblet squat', 'squat', 'home', [], 2, [], ['bw', 'short'], 'Hold a backpack filled with books or water bottles against your chest. Same movement as a goblet squat.'),
  x('back-squat', 'Barbell back squat', 'squat', 'gym', [], 3, ['knee', 'back', 'heart'], ['free', 'heavy', 'heavyBar', 'short'], 'Bar on your upper back, belly braced, sit down between your hips with the whole foot on the floor. Always use the rack safety bars.'),
  x('wall-sit', 'Wall sit (thighs above parallel)', 'quad', 'both', [], 1, ['heart'], ['bw', 'hold'], 'Back flat on the wall, knees over your ankles, thighs no lower than parallel. Breathe normally.'),
  // ---------------------------------------------------------------- legs: hinge and glutes
  x('rdl-db', 'Dumbbell Romanian deadlift', 'hinge', 'both', ['dumbbells'], 2, ['back'], ['free', 'tall'], 'Soft knees, push your hips back and slide the dumbbells down your thighs until the back of your legs stretch. Squeeze your glutes to stand.'),
  x('rdl-bb', 'Barbell Romanian deadlift', 'hinge', 'gym', [], 3, ['back', 'heart'], ['free', 'heavy', 'heavyBar', 'tall'], 'Bar close to your legs, hips back, flat back. Stop when your hamstrings are stretched, then drive your hips forward.'),
  x('trap-deadlift', 'Trap-bar deadlift', 'hinge', 'gym', [], 2, ['back', 'heart'], ['free', 'heavy', 'tall'], 'Stand inside the bar, hips back, chest up. Push the floor away and stand tall without leaning back.'),
  x('pull-through', 'Cable pull-through', 'hinge', 'gym', [], 1, [], ['cable', 'joint', 'glute', 'tall'], 'Face away from the cable with the rope between your legs. Push your hips back with a flat back, then squeeze your glutes to stand tall.'),
  x('back-ext', '45-degree back extension (glute focus)', 'hinge', 'gym', [], 1, ['back'], ['machine', 'glute'], 'Round your upper back slightly and lift with your glutes. Stop when your body is in a straight line, do not arch.'),
  x('hip-thrust-bb', 'Barbell hip thrust', ['glute', 'hinge'], 'gym', [], 2, ['heart'], ['free', 'glute', 'heavy'], 'Upper back on a bench, bar padded on your hips. Chin tucked, drive through your heels and squeeze for one second at the top.'),
  x('hip-thrust-machine', 'Hip thrust machine', ['glute', 'hinge'], 'gym', [], 1, [], ['machine', 'glute', 'joint'], 'Pad on your hips, drive through your heels and squeeze your glutes at the top. Lower slowly.'),
  x('glute-bridge', 'Glute bridge', ['glute', 'hinge'], 'both', [], 1, [], ['bw', 'glute', 'joint'], 'Lie on your back, feet flat. Push your hips up until your body is in a line, squeeze, lower slowly. Rest a dumbbell or backpack on your hips to progress.'),
  x('sl-glute-bridge', 'Single-leg glute bridge', 'glute', 'both', [], 2, [], ['bw', 'glute', 'uni'], 'One foot flat, the other leg straight. Keep your hips level as you lift and lower.'),
  x('frog-pump', 'Frog pump', 'glute', 'both', [], 1, [], ['bw', 'glute', 'joint'], 'Lie on your back, soles of your feet together, knees falling out. Push your hips up and squeeze for one second.'),
  x('banded-bridge', 'Banded glute bridge', 'glute', 'home', ['bands'], 1, [], ['glute', 'joint'], 'Band just above your knees. Push your knees out against the band as you lift your hips.'),
  x('band-pull-through', 'Banded pull-through', 'hinge', 'home', ['bands'], 1, [], ['glute', 'joint'], 'Anchor a band low behind you and hold it between your legs. Hinge back, then squeeze your glutes to stand.'),
  x('cable-kickback', 'Cable glute kickback', 'glute', 'gym', [], 1, [], ['cable', 'glute', 'uni'], 'Ankle strap on, hold the frame. Kick back and slightly up without arching your lower back.'),
  x('hip-abduction', 'Hip abduction machine', 'glute', 'gym', [], 1, [], ['machine', 'glute', 'joint'], 'Sit tall, push the pads out with your outer hips and return slowly.'),
  x('sl-rdl', 'Single-leg Romanian deadlift', 'hinge', 'both', [], 2, ['back'], ['uni', 'balance', 'glute'], 'Hinge forward on one leg with the other leg reaching back, hips square. Touch a wall or chair for balance if you need to.'),
  x('kb-swing', 'Kettlebell swing', 'hinge', 'both', ['kettlebell'], 2, ['back', 'heart'], ['free', 'power', 'glute'], 'Hinge, hike the bell back, snap your hips forward and let it float to chest height. It is a hip movement, not a squat or an arm lift.'),
  // ---------------------------------------------------------------- legs: single leg, quads, hamstrings, calves
  x('split-db', 'Dumbbell split squat', 'lunge', 'both', ['dumbbells'], 2, ['knee'], ['free', 'uni', 'glute'], 'Long stance. Drop the back knee straight down, keep the front heel planted, then push up.'),
  x('bulgarian', 'Bulgarian split squat (back foot raised)', 'lunge', 'both', [], 3, ['knee'], ['uni', 'glute', 'heavy', 'balance'], 'Back foot on a bench or chair, front foot far enough forward that your knee stays over the middle of your foot. Add dumbbells or a backpack later.'),
  x('reverse-lunge', 'Reverse lunge', 'lunge', 'both', [], 1, ['knee'], ['bw', 'uni', 'glute', 'joint'], 'Step back and lower the back knee toward the floor. Push through the front heel to come back.'),
  x('walking-lunge', 'Walking lunge', 'lunge', 'both', [], 2, ['knee'], ['uni', 'glute', 'balance'], 'Long steps, torso tall, back knee lightly touches the floor. Add dumbbells when it feels easy.'),
  x('step-up', 'Step-up (low box or stair)', 'lunge', 'both', [], 1, [], ['uni', 'joint', 'glute'], 'Whole foot on the step. Push through that heel to stand fully, then lower slowly. Do not push off the back foot.'),
  x('smith-split', 'Smith machine split squat', 'lunge', 'gym', [], 2, ['knee', 'heart'], ['machine', 'uni', 'glute'], 'Front foot forward under the bar, back foot behind. Lower the back knee straight down and push up.'),
  x('leg-ext', 'Leg extension machine', 'quad', 'gym', [], 1, ['knee'], ['machine'], 'Pad on your lower shin. Straighten your legs, pause, lower for three seconds. Use a light weight if your knees are sensitive.'),
  x('leg-curl-seated', 'Seated leg curl', 'ham', 'gym', [], 1, [], ['machine', 'joint'], 'Pad just above your heels. Curl under you, pause, return slowly without letting the stack slam.'),
  x('leg-curl-lying', 'Lying leg curl', 'ham', 'gym', [], 1, [], ['machine'], 'Hips pressed into the pad. Curl your heels to your glutes and lower for three seconds.'),
  x('slider-curl', 'Towel hamstring curl (on a smooth floor)', 'ham', 'both', [], 2, [], ['bw', 'joint'], 'Lie on your back with your heels on a towel. Lift your hips, slide your heels out and pull them back in without dropping your hips.'),
  x('band-leg-curl', 'Banded leg curl', 'ham', 'home', ['bands'], 1, [], ['joint'], 'Anchor the band at ankle height and lie face down. Curl your heel toward your glute against the band.'),
  x('nordic', 'Nordic hamstring lower', 'ham', 'both', [], 3, ['knee'], ['bw'], 'Anchor your ankles under something heavy. Lower your body forward as slowly as you can, catch yourself with your hands, push back up.'),
  x('calf-machine', 'Standing calf raise machine', 'calf', 'gym', [], 1, [], ['machine'], 'Rise high on your toes, pause for one second at the top, lower until your heels are below the platform.'),
  x('calf-press', 'Calf raise on the leg press', 'calf', 'gym', [], 1, [], ['machine', 'joint'], 'Balls of your feet on the bottom of the platform. Push through your toes, pause, and stretch at the bottom.'),
  x('calf-step', 'Calf raise on a step', 'calf', 'both', [], 1, [], ['bw'], 'Heels hang off a step. Rise high, pause, lower slowly below the step. Hold a dumbbell or backpack for more load, or go one leg at a time.'),
  // ---------------------------------------------------------------- push: chest
  x('chest-press-machine', 'Chest press machine', 'hpress', 'gym', [], 1, [], ['machine', 'joint', 'heavy'], 'Seat height so the handles are at mid-chest. Press forward without locking out, return slowly.'),
  x('db-bench', 'Dumbbell bench press', 'hpress', 'both', ['dumbbells', 'bench'], 2, [], ['free', 'heavy'], 'Shoulder blades pinched back and down, feet planted. Lower to the line of your chest, then press up and slightly in.'),
  x('bb-bench', 'Barbell bench press', 'hpress', 'gym', [], 3, ['shoulder', 'heart'], ['free', 'heavy', 'heavyBar', 'short'], 'Eyes under the bar, shoulder blades back, feet planted. Touch mid-chest and press up. Use safety arms or a spotter.'),
  x('smith-bench', 'Smith machine bench press', 'hpress', 'gym', [], 2, ['heart'], ['machine', 'heavy'], 'Bench placed so the bar lowers to mid-chest. Press up in a straight line.'),
  x('pushup', 'Push-up', 'hpress', 'both', [], 2, ['wrist'], ['bw', 'short'], 'Hands under your shoulders, body in one straight line. Lower your chest to a fist height from the floor, then push away.'),
  x('incline-pushup', 'Incline push-up (hands on a bench or counter)', 'hpress', 'both', [], 1, ['wrist'], ['bw', 'joint'], 'The higher your hands, the easier it is. Lower the height over the weeks until you can do floor push-ups.'),
  x('knee-pushup', 'Knee push-up', 'hpress', 'both', [], 1, ['wrist'], ['bw', 'joint'], 'A straight line from your knees to your head. Lower your chest slowly and push back up.'),
  x('pushup-handles', 'Push-up on fists or handles', 'hpress', 'both', [], 2, [], ['bw', 'short'], 'Neutral wrists on fists, handles or dumbbells you hold firmly so they cannot roll. A deeper range than a floor push-up.'),
  x('floor-press', 'Dumbbell floor press', 'hpress', 'both', ['dumbbells'], 2, [], ['free', 'short', 'joint'], 'Lie on the floor. Lower until your elbows touch the floor, pause, press up. The floor protects your shoulders.'),
  x('band-chest-press', 'Banded chest press', 'hpress', 'home', ['bands'], 1, [], ['joint'], 'Band around your back, hold the ends, press forward until your arms are straight and return slowly.'),
  x('incline-db', 'Incline dumbbell press', 'ipress', 'both', ['dumbbells', 'bench'], 2, [], ['free'], 'Bench at a low incline (about 30 degrees). Press up and slightly in, lower to the upper chest.'),
  x('incline-machine', 'Incline chest press machine', 'ipress', 'gym', [], 1, [], ['machine', 'joint'], 'Handles at upper-chest height. Press up and forward, return with control.'),
  x('incline-bb', 'Incline barbell press', 'ipress', 'gym', [], 3, ['shoulder', 'heart'], ['free', 'heavy', 'heavyBar'], 'Low incline bench, bar to your upper chest, press straight up. Use safety arms or a spotter.'),
  x('smith-incline', 'Smith machine incline press', 'ipress', 'gym', [], 2, ['heart'], ['machine'], 'Bench at a low incline, lower the bar to your upper chest and press up.'),
  x('feet-low-pushup', 'Push-up with feet on a low step (use fists if wrists are sensitive)', 'ipress', 'both', [], 2, [], ['bw'], 'Feet on a low step, hands under your shoulders. Body in one line, lower your chest and push away.'),
  x('feet-high-pushup', 'Push-up with feet on a chair', 'ipress', 'both', [], 3, ['wrist', 'shoulder'], ['bw'], 'Feet on a sturdy chair, body in one straight line. Lower slowly and press away without sagging.'),
  x('pec-deck', 'Pec deck (machine fly)', 'fly', 'gym', [], 1, [], ['machine', 'joint'], 'Elbows slightly bent and level with your shoulders. Bring the handles together in front of you and return slowly.'),
  x('cable-fly', 'Cable fly (low to high)', 'fly', 'gym', [], 2, ['shoulder'], ['cable'], 'Pulleys low, a small bend in your elbows. Sweep your hands up and together at chest height, return slowly.'),
  x('db-fly', 'Dumbbell fly', 'fly', 'both', ['dumbbells', 'bench'], 2, ['shoulder'], ['free'], 'Slight elbow bend, open your arms until you feel a stretch across your chest, then hug the weights back up.'),
  x('band-fly', 'Banded chest fly', 'fly', 'home', ['bands'], 1, [], ['joint'], 'Anchor the band behind you at chest height and bring your hands together in front of you with soft elbows.'),
  x('palm-press', 'Palm press (chest squeeze)', 'fly', 'both', [], 1, ['heart'], ['bw', 'hold'], 'Press your palms together in front of your chest as hard as you can for 10 seconds. Breathe normally.'),
  // ---------------------------------------------------------------- push: shoulders and triceps
  x('shoulder-press-machine', 'Shoulder press machine', 'vpress', 'gym', [], 1, ['shoulder'], ['machine', 'joint', 'heavy'], 'Seat so the handles start at shoulder height. Press up without locking out, lower slowly.'),
  x('db-shoulder-press', 'Dumbbell shoulder press', 'vpress', 'both', ['dumbbells'], 2, ['shoulder'], ['free'], 'Sit with back support if you can. Press until your arms are nearly straight. Keep your ribs down and do not arch your lower back.'),
  x('bb-ohp', 'Barbell overhead press', 'vpress', 'gym', [], 3, ['shoulder', 'back', 'heart'], ['free', 'heavy', 'heavyBar'], 'Bar at your collarbone, glutes tight, press straight up and move your head through at the top.'),
  x('landmine-press', 'Landmine press', 'vpress', 'gym', [], 2, [], ['free', 'joint'], 'One end of the bar in a corner or landmine base. Press up and forward in a natural arc. Kind to most shoulders.'),
  x('kb-press', 'Kettlebell press', 'vpress', 'both', ['kettlebell'], 2, ['shoulder'], ['free'], 'Bell at your shoulder with the wrist straight. Press overhead and lower under control.'),
  x('pike-pushup', 'Pike push-up', 'vpress', 'both', [], 2, ['shoulder', 'wrist'], ['bw'], 'Hips high, hands on the floor. Lower the top of your head toward the floor between your hands, then push back.'),
  x('backpack-ohp', 'Backpack overhead press', 'vpress', 'home', [], 1, ['shoulder'], ['bw', 'joint'], 'Hold a loaded backpack by the handle or at your shoulders with both hands and press it overhead.'),
  x('band-ohp', 'Banded overhead press', 'vpress', 'home', ['bands'], 1, ['shoulder'], ['joint'], 'Stand on the band, hold the ends at your shoulders and press overhead.'),
  x('lateral-db', 'Dumbbell lateral raise', 'lateral', 'both', ['dumbbells'], 1, [], ['free'], 'A slight bend in your elbows. Lift out to shoulder height only, lead with your elbows, lower slowly. Light weight, high control.'),
  x('lateral-cable', 'Cable lateral raise', 'lateral', 'gym', [], 1, [], ['cable'], 'Pulley low, work one arm at a time. Lift out to shoulder height with a soft elbow and lower slowly.'),
  x('lateral-machine', 'Lateral raise machine', 'lateral', 'gym', [], 1, [], ['machine', 'joint'], 'Pads against your arms. Raise to shoulder height and lower slowly.'),
  x('lateral-band', 'Banded lateral raise', 'lateral', 'home', ['bands'], 1, ['shoulder'], ['joint'], 'Stand on the band, lift out to shoulder height with soft elbows.'),
  x('lateral-bottle', 'Lateral raise with water bottles or bags', 'lateral', 'both', [], 1, [], ['bw'], 'Fill two bottles or hold two small bags. Same movement as a dumbbell lateral raise.'),
  x('rev-pec-deck', 'Reverse pec deck (rear shoulder fly)', 'rear', 'gym', [], 1, [], ['machine', 'joint'], 'Chest on the pad, arms level with your shoulders. Open your arms wide by squeezing your shoulder blades together.'),
  x('face-pull', 'Cable face pull', 'rear', 'gym', [], 1, [], ['cable', 'joint'], 'Rope at face height. Pull toward your forehead with high elbows and rotate your hands outward at the end.'),
  x('rear-fly-supported', 'Chest-supported rear fly (incline bench)', 'rear', 'both', ['dumbbells', 'bench'], 1, [], ['free', 'joint'], 'Chest on a bench set at an incline. Open the dumbbells out to the side with soft elbows and squeeze your shoulder blades.'),
  x('rear-fly-db', 'Bent-over rear shoulder fly', 'rear', 'both', ['dumbbells'], 2, ['back'], ['free'], 'Hinge forward with a flat back, open the dumbbells out to the sides with soft elbows.'),
  x('band-pull-apart', 'Band pull-apart', 'rear', 'home', ['bands'], 1, [], ['joint'], 'Hold a band at chest height with straight arms and pull it apart until it touches your chest.'),
  x('prone-ytw', 'Prone Y-T-W raise', 'rear', 'both', [], 1, [], ['bw', 'joint'], 'Lie face down on the floor or a bed. Lift your arms in a Y, a T, then a W, thumbs up, squeezing your shoulder blades.'),
  x('pushdown-rope', 'Cable rope pushdown', 'tri', 'gym', [], 1, [], ['cable', 'joint'], 'Elbows pinned to your sides. Push down and spread the rope at the bottom, return until your forearms are just past parallel.'),
  x('overhead-cable-ext', 'Overhead cable triceps extension', 'tri', 'gym', [], 1, ['shoulder', 'elbow'], ['cable'], 'Face away from the cable, elbows by your ears. Straighten your arms and return slowly.'),
  x('skull', 'EZ-bar skull crusher', 'tri', 'gym', [], 2, ['elbow', 'shoulder', 'wrist'], ['free'], 'Lying on a bench, lower the bar toward your forehead by bending only at the elbows, then straighten.'),
  x('db-overhead-ext', 'Dumbbell overhead triceps extension', 'tri', 'both', ['dumbbells'], 1, ['elbow', 'shoulder'], ['free'], 'Hold one dumbbell overhead with both hands. Lower it behind your head by bending your elbows, then straighten.'),
  x('assisted-dip', 'Assisted dip machine', 'tri', 'gym', [], 2, ['shoulder', 'elbow'], ['machine'], 'Stay upright, lower until your elbows are at 90 degrees only, push back up.'),
  x('diamond-pushup', 'Close-grip push-up', 'tri', 'both', [], 2, ['wrist', 'elbow'], ['bw'], 'Hands slightly closer than your shoulders, elbows brushing your ribs as you lower.'),
  x('band-pushdown', 'Banded triceps pushdown', 'tri', 'home', ['bands'], 1, [], ['joint'], 'Anchor the band high, elbows pinned to your sides, push down until your arms are straight.'),
  x('kickback-db', 'Dumbbell triceps kickback', 'tri', 'both', ['dumbbells'], 1, [], ['free'], 'Hinge forward, upper arm in line with your back, straighten your elbow and squeeze.'),
  x('kickback-bottle', 'Triceps kickback with a water bottle', 'tri', 'both', [], 1, [], ['bw'], 'Hinge forward, upper arm in line with your back, straighten your elbow and squeeze.'),
  // ---------------------------------------------------------------- pull
  x('lat-pulldown', 'Lat pulldown', 'vpull', 'gym', [], 1, [], ['machine', 'tall', 'joint', 'heavy'], 'Grip a little wider than your shoulders and lean back slightly. Pull the bar to your upper chest with your elbows going down and back.'),
  x('close-pulldown', 'Close-grip (V-handle) pulldown', 'vpull', 'gym', [], 1, [], ['cable', 'tall', 'joint'], 'Chest tall, pull the handle to your upper chest and squeeze your lats.'),
  x('assisted-pullup', 'Assisted pull-up machine', 'vpull', 'gym', [], 1, [], ['machine', 'tall'], 'Choose enough assistance for 8 clean reps. Start from straight arms, pull your chest to the bar.'),
  x('straight-arm', 'Straight-arm pulldown', 'vpull', 'gym', [], 1, [], ['cable', 'joint'], 'Arms nearly straight, push the bar down to your thighs using your lats, return slowly.'),
  x('pullup', 'Pull-up', 'vpull', 'both', ['pullupbar'], 3, ['shoulder', 'elbow'], ['bw', 'heavy'], 'Start from a full hang. Pull your chest toward the bar and lower for two seconds.'),
  x('chinup', 'Chin-up', 'vpull', 'both', ['pullupbar'], 3, ['elbow'], ['bw', 'heavy'], 'Palms facing you. Pull your chin over the bar and lower slowly.'),
  x('neg-pullup', 'Slow-lowering pull-up', 'vpull', 'both', ['pullupbar'], 2, ['shoulder', 'elbow'], ['bw'], 'Step or jump to the top position and lower yourself for four to five seconds. Builds the strength for a full pull-up.'),
  x('band-assisted-pullup', 'Band-assisted pull-up', 'vpull', 'home', ['pullupbar', 'bands'], 2, ['shoulder', 'elbow'], ['bw'], 'Loop a band over the bar and under your knee or foot. Pull up using the band to help the bottom half.'),
  x('band-pulldown', 'Banded lat pulldown', 'vpull', 'home', ['bands'], 1, [], ['joint'], 'Anchor the band high (door anchor). Kneel and pull your elbows down to your ribs.'),
  x('superman-pulldown', 'Superman pulldown (lying on the floor)', 'vpull', 'both', [], 1, ['back'], ['bw'], 'Lie face down with arms overhead. Lift your chest slightly and sweep your elbows down to your ribs, squeezing your back.'),
  x('towel-pull', 'Towel pull-apart (standing lat squeeze)', 'vpull', 'both', [], 1, ['heart'], ['bw', 'hold'], 'Hold a towel tight overhead and pull outward as if tearing it, bringing your elbows down to your ribs while keeping the pull.'),
  x('seated-row', 'Seated cable row', 'hrow', 'gym', [], 1, [], ['cable', 'joint', 'tall'], 'Chest tall. Pull the handle to your belly button, squeeze your shoulder blades, return with control and do not rock.'),
  x('chest-row-machine', 'Chest-supported row machine', 'hrow', 'gym', [], 1, [], ['machine', 'joint', 'heavy', 'tall'], 'Chest on the pad. Pull your elbows back past your body and squeeze, return slowly.'),
  x('tbar', 'T-bar row', 'hrow', 'gym', [], 2, ['back'], ['free', 'heavy'], 'Hinge with a flat back and pull the handle to your lower chest. Keep your hips still.'),
  x('bb-row', 'Barbell bent-over row', 'hrow', 'gym', [], 3, ['back', 'heart'], ['free', 'heavy', 'heavyBar'], 'Hinge to about 45 degrees, flat back, pull the bar to your belly. Do not jerk your torso up.'),
  x('db-row', 'One-arm dumbbell row (hand on a bench)', 'hrow', 'both', ['dumbbells', 'bench'], 2, [], ['free', 'uni'], 'Hand and knee on a bench, flat back. Pull the dumbbell to your hip. Supported, so your lower back is protected.'),
  x('db-row-supported', 'Chest-supported dumbbell row (incline bench)', 'hrow', 'both', ['dumbbells', 'bench'], 1, [], ['free', 'joint'], 'Chest on a bench set at an incline. Row both dumbbells toward your hips and squeeze.'),
  x('bag-row', 'One-arm row with a bag or water can (hand on a chair)', 'hrow', 'both', [], 1, [], ['bw', 'uni'], 'One hand and one knee on a chair or bed. Row a loaded bag or water can to your hip.'),
  x('inverted-row', 'Inverted row (sturdy table or low bar)', 'hrow', 'both', [], 2, [], ['bw'], 'Lie under a very sturdy table or low bar and pull your chest up with a straight body. Only use a table that cannot tip or slide.'),
  x('band-row', 'Banded row', 'hrow', 'home', ['bands'], 1, [], ['joint'], 'Anchor the band at chest height, pull the ends to your ribs and squeeze your shoulder blades.'),
  x('db-curl', 'Dumbbell biceps curl', 'bicep', 'both', ['dumbbells'], 1, [], ['free'], 'Elbows by your sides. Curl up, squeeze, lower for two to three seconds. No swinging.'),
  x('hammer-curl', 'Hammer curl', 'bicep', 'both', ['dumbbells'], 1, [], ['free', 'joint'], 'Palms facing each other. Curl up and lower slowly. Good for the forearm and upper arm together.'),
  x('cable-curl', 'Cable biceps curl', 'bicep', 'gym', [], 1, [], ['cable'], 'Elbows by your sides, curl the handle up and lower slowly with constant tension.'),
  x('ez-curl', 'EZ-bar curl', 'bicep', 'gym', [], 2, ['wrist', 'elbow'], ['free'], 'Hold the angled grips, elbows pinned to your sides. Curl up and lower slowly.'),
  x('incline-curl', 'Incline dumbbell curl', 'bicep', 'both', ['dumbbells', 'bench'], 2, ['shoulder'], ['free'], 'Lean back on an incline bench, arms hanging. Curl up without moving your elbows forward.'),
  x('preacher-machine', 'Preacher curl machine', 'bicep', 'gym', [], 1, [], ['machine', 'joint'], 'Upper arms flat on the pad. Curl up and lower fully under control.'),
  x('band-curl', 'Banded biceps curl', 'bicep', 'home', ['bands'], 1, ['shoulder'], ['joint'], 'Stand on the band, elbows by your sides, curl up and lower slowly.'),
  x('backpack-curl', 'Backpack or water-can curl', 'bicep', 'both', [], 1, [], ['bw'], 'Hold a loaded backpack by the handle or a filled can. Curl up and lower slowly.'),
  // ---------------------------------------------------------------- core
  x('plank', 'Forearm plank', 'core', 'both', [], 1, ['heart'], ['bw', 'hold'], 'Elbows under your shoulders, body in one line, glutes and belly tight. Breathe normally.'),
  x('dead-bug', 'Dead bug', 'core', 'both', [], 1, [], ['bw', 'joint'], 'Back flat on the floor. Lower the opposite arm and leg slowly while your lower back stays pressed down.'),
  x('bird-dog', 'Bird dog', 'core', 'both', [], 1, [], ['bw', 'joint'], 'On hands and knees, reach the opposite arm and leg out without letting your hips twist. Hold one second.'),
  x('side-plank', 'Side plank', 'core', 'both', [], 2, ['shoulder', 'heart'], ['bw', 'hold', 'uni'], 'Elbow under your shoulder, hips lifted in a straight line. Do both sides.'),
  x('pallof', 'Pallof press (cable)', 'core', 'gym', [], 1, [], ['cable', 'joint'], 'Stand side-on to the cable and press the handle straight out without letting it pull you around.'),
  x('pallof-band', 'Banded Pallof press', 'core', 'home', ['bands'], 1, [], ['joint'], 'Anchor the band at chest height, stand side-on and press straight out without letting it pull you around.'),
  x('cable-crunch', 'Cable crunch', 'core', 'gym', [], 2, ['back'], ['cable'], 'Kneel under a rope, round your upper back and bring your elbows toward your knees. Do not sit back on your heels.'),
  x('captain-chair', "Captain's chair knee raise", 'core', 'gym', [], 2, ['back', 'shoulder'], ['machine'], 'Forearms on the pads, back on the rest. Lift your knees toward your chest and lower slowly.'),
  x('reverse-crunch', 'Reverse crunch', 'core', 'both', [], 2, ['back'], ['bw'], 'Lie on your back, knees bent. Curl your hips off the floor toward your chest and lower slowly.'),
  x('farmer-carry', 'Farmer carry', 'core', 'both', ['dumbbells'], 1, [], ['free', 'joint', 'hold'], 'Heavy dumbbells at your sides, tall posture. Short steady steps for 30 to 40 seconds.'),
  x('bag-carry', 'Suitcase carry (water cans or bags)', 'core', 'both', [], 1, [], ['bw', 'joint', 'uni', 'hold'], 'Carry a heavy bag in one hand and stay tall without leaning. Walk 30 to 40 seconds, then switch hands.'),
];

const BY_ID = Object.fromEntries(LIB.map((e) => [e.id, e]));
const INDEX = Object.fromEntries(LIB.map((e, i) => [e.id, i]));

/**
 * ctx = { where: 'gym' | 'home', equip: Set (home equipment), level, limits: Set, body: { tall, short, heavy, older, female, light, type } }
 */
function usable(ex, ctx, relaxLevel = false) {
  if (ctx.where === 'gym' ? ex.venue === 'home' : ex.venue === 'gym') return false;
  if (ctx.where === 'gym') { if (!ex.eq.every((t) => GYM_TOKENS.has(t))) return false; }
  else if (!ex.eq.every((t) => ctx.equip.has(t))) return false;
  for (const l of ex.avoid) if (ctx.limits.has(l)) return false;
  if (!relaxLevel && ctx.level === 'beginner' && ex.diff >= 3) return false;
  return true;
}

function score(ex, ctx) {
  const t = ex.tags, b = ctx.body || {};
  let s = 0;
  if (ctx.level === 'beginner') s += ex.diff === 1 ? 3 : ex.diff === 2 ? 1 : -4;
  else if (ctx.level === 'intermediate') s += ex.diff === 2 ? 2 : ex.diff === 3 ? 1 : 0;
  else s += ex.diff === 3 ? 2 : ex.diff === 2 ? 1 : 0;
  if (b.heavy) { if (t.includes('joint')) s += 2; if (t.includes('balance')) s -= 1; if (t.includes('power')) s -= 2; }
  if (b.tall && t.includes('tall')) s += 2;
  if (b.short && t.includes('short')) s += 1;
  if (b.older) { if (t.includes('joint')) s += 1; if (t.includes('heavyBar')) s -= 2; if (t.includes('power')) s -= 2; }
  if (b.female && t.includes('glute')) s += 1;
  if (b.type === 'muscular' && t.includes('heavy')) s += 1;
  if (b.type === 'athletic' && (t.includes('uni') || t.includes('power'))) s += 1;
  if (b.light && t.includes('heavy')) s += 1;
  if (ctx.where === 'home' && ctx.level !== 'beginner' && ex.eq.length) s += 1; // use what they own
  return s - INDEX[ex.id] * 0.001; // the library order is the expert tie-break
}

/** Usable exercises for a slot, best first. If the level filter leaves nothing, it is relaxed (never the limit or equipment filter). */
function rank(slot, ctx, exclude = []) {
  const pick = (relax) => LIB.filter((e) => e.slots.includes(slot) && !exclude.includes(e.id) && usable(e, ctx, relax));
  let list = pick(false);
  if (!list.length) list = pick(true);
  return list.map((e) => [e, score(e, ctx)]).sort((a, b) => b[1] - a[1]).map((p) => p[0]);
}

const kindOf = (ex) => (ex.tags.includes('machine') ? 'machine' : ex.tags.includes('cable') ? 'cable' : ex.tags.includes('band') ? 'band' : ex.tags.includes('bw') ? 'bodyweight' : 'free weights');
const KIND_TEXT = {
  machine: 'Machine: guided and easy to set up',
  cable: 'Cable: smooth, constant tension',
  band: 'Resistance band: light and portable',
  bodyweight: 'Bodyweight or a loaded bag: no gym needed',
  'free weights': 'Free weights: needs a little more balance and control',
};
// What to do with the load when the kind of equipment changes.
function switchHint(from, to) {
  if (from === to) return 'Start about 20 percent lighter and find your weight in two warm-up sets.';
  if (to === 'bodyweight' || to === 'band') return 'Use reps and a slow tempo (3 seconds down) to make it hard enough. Stop with 2 to 3 reps left.';
  if (from === 'machine' || from === 'cable') return 'Start about 30 percent lighter. Free weights ask more of your balance.';
  return 'Machines feel lighter. Find your weight in two warm-up sets, then stay with the same reps.';
}

const brief = (ex, from) => ({ id: ex.id, name: ex.name, kind: kindOf(ex), why: KIND_TEXT[kindOf(ex)], hint: switchHint(from, kindOf(ex)) });

/**
 * Alternatives for one exercise in one slot.
 *   busy         up to 3 gym options of different kinds (machine taken, or this one is missing at your gym)
 *   dumbbellOnly one option that needs nothing but dumbbells and a bench
 *   home         one option that needs no equipment at all
 *   easier / harder  the neighbouring step in difficulty, in the same place the person is training
 */
function swapsFor(ex, slot, ctx) {
  const from = kindOf(ex);
  const gymCtx = { ...ctx, where: 'gym' };
  const noEquip = { ...ctx, where: 'home', equip: new Set() };
  const gymList = rank(slot, gymCtx, [ex.id]);
  const busy = [];
  const kinds = new Set();
  for (const e of gymList) { const k = kindOf(e); if (!kinds.has(k) && busy.length < 3) { kinds.add(k); busy.push(e); } }
  for (const e of gymList) if (busy.length < 3 && !busy.includes(e)) busy.push(e);
  const dbOnly = gymList.find((e) => !e.tags.includes('machine') && !e.tags.includes('cable') && e.venue !== 'gym' && e.eq.length && e.eq.every((t) => t === 'dumbbells' || t === 'bench'));
  const home = rank(slot, noEquip, [ex.id])[0] || null;
  const here = rank(slot, ctx, [ex.id]);
  const easier = here.filter((e) => e.diff < ex.diff).sort((a, b) => b.diff - a.diff)[0] || null;
  const harder = here.filter((e) => e.diff > ex.diff).sort((a, b) => a.diff - b.diff)[0] || null;
  return {
    busy: busy.map((e) => brief(e, from)),
    dumbbellOnly: dbOnly ? brief(dbOnly, from) : null,
    home: home ? brief(home, from) : null,
    easier: easier ? { id: easier.id, name: easier.name } : null,
    harder: harder ? { id: harder.id, name: harder.name } : null,
  };
}

module.exports = { FORM, LIB, BY_ID, SLOTS, LEVELS, PLACES, LIMITS, HOME_EQUIP, GYM_TOKENS, FOCUS, usable, score, rank, kindOf, swapsFor, KIND_TEXT };
