// Exercise catalogue. Calories burned = MET x body weight (kg) x hours, so every activity needs a MET value.
//
// MET values come from the Compendium of Physical Activities where an equivalent activity exists. Cult.fit does not
// publish energy cost per class, so the Cult formats are ESTIMATES mapped to the closest compendium activity and
// the class's published intensity (e.g. HRX "medium", Boxing / Dance Fitness / Adidas Strength+ "high"). Real burn varies
// with effort, so treat them as a sensible guide and use the manual-calories box when you know better.
//
// Seeded additively at server start (matched by name): never deletes, never overwrites, never touches logged workouts.
const C = 'Cult.fit';
const cult = (name, met, description) => ({ name: `Cult – ${name}`, category: C, met, description: `${description} (MET estimate — real burn varies with effort)` });

const ACTIVITIES = [
  // ---- originals (kept as they were)
  { name: 'Walking - Slow', category: 'Walking', met: 2.8, description: 'Slow or casual walking' },
  { name: 'Walking - Moderate', category: 'Walking', met: 3.5, description: 'Normal moderate-paced walking' },
  { name: 'Walking - Brisk', category: 'Walking', met: 4.3, description: 'Brisk, purposeful walking' },
  { name: 'Running - Easy', category: 'Running', met: 7.0, description: 'Easy jog' },
  { name: 'Running - Moderate', category: 'Running', met: 8.3, description: 'Steady run' },
  { name: 'Cycling - Moderate', category: 'Cycling', met: 7.5, description: 'Moderate cycling' },
  { name: 'Strength Training', category: 'Strength', met: 5.0, description: 'General weight training' },
  { name: 'Weight Training - Vigorous', category: 'Strength', met: 6.0, description: 'Heavy / vigorous weight training' },
  { name: 'HIIT', category: 'HIIT', met: 8.0, description: 'High-intensity interval training' },
  { name: 'Yoga', category: 'Mind & Mobility', met: 2.5, description: 'General yoga' },
  { name: 'Swimming - Moderate', category: 'Swimming', met: 6.0, description: 'Moderate lap swimming' },
  { name: 'Stair Climbing', category: 'Cardio', met: 8.8, description: 'Stair climbing exercise' },

  // ---- Cult.fit: strength & conditioning formats
  cult('HRX Workout', 5.5, 'Functional strength + conditioning circuit, medium intensity, ~45 min'),
  cult('Adidas Strength+', 6.0, 'High-intensity strength, endurance and mobility class'),
  cult('Strength & Conditioning (S&C)', 6.0, 'Warm-up, conditioning routine and core finisher'),
  cult('Advanced S&C', 6.5, 'Heavier, higher-intensity strength and conditioning'),
  cult('Burn', 6.5, 'High-intensity, lower-impact training with strength and mobility'),
  cult('Bootcamp', 7.0, 'Targeted high-effort weight-loss routines'),
  cult('Transform', 6.0, 'Goal-based body transformation workout'),
  cult('Kettlebell', 6.0, 'Kettlebell strength and conditioning class'),
  cult('Body Pump', 5.0, 'Barbell-based group strength class'),
  cult('Core & Mobility', 3.0, 'Core strength with mobility work'),
  cult('Home workout (no equipment)', 4.5, 'cultpass LIVE style bodyweight session'),
  // ---- Cult.fit: cardio, boxing, dance
  cult('HIIT', 8.0, 'High-intensity interval training class'),
  cult('Cardio', 6.5, 'Trainer-led cardio session'),
  cult('Boxing (Bag Workout)', 7.0, 'Technique, skill work and conditioning on the bag'),
  cult('Kickboxing', 7.5, 'Punches and kicks with conditioning'),
  cult('Dance Fitness', 6.0, 'Dance-based cardio, high energy, beginner friendly'),
  cult('Dance Fitness Xpress', 5.5, 'Shorter dance-fitness session'),
  cult('Dance Fitness Xtreme', 7.0, 'Faster, higher-intensity dance-fitness session'),
  cult('Zumba', 6.5, 'Latin and international dance-fitness'),
  cult('Run (outdoor group run)', 9.0, 'Trainer-led outdoor high-intensity running class'),
  cult('Walk', 3.5, 'Guided walking session'),
  // ---- Cult.fit: yoga, pilates, mind
  cult('Yoga (Hatha)', 2.5, 'Slow-paced postures, breathing and relaxation'),
  cult('Yoga (Evolve / Vinyasa)', 3.5, 'Flowing, breath-linked yoga'),
  cult('Power Yoga', 4.0, 'Strength-focused, faster-paced yoga'),
  cult('Yoga Ignite', 3.5, 'Active yoga flow'),
  cult('Relax Yoga / Yoga Nidra', 1.5, 'Restorative yoga and guided relaxation'),
  cult('Surya Namaskar (sun salutations)', 3.3, 'Sun salutation rounds'),
  cult('Pilates', 3.0, 'Core-focused mat Pilates'),
  cult('Pranayama', 1.3, 'Breathing practice'),
  cult('Meditation', 1.0, 'Seated meditation'),
  cult('Stretching / Mobility', 2.3, 'Stretching and flexibility session'),
  // ---- Cult.fit gym
  cult('Gym – strength floor', 5.0, 'Free weights and machines'),
  cult('Gym – cardio (treadmill / cross-trainer)', 6.0, 'Machine cardio'),

  // ---- Sports & play
  { name: 'Badminton - Recreational', category: 'Sports', met: 4.5, description: 'Social badminton' },
  { name: 'Badminton - Competitive', category: 'Sports', met: 7.0, description: 'Competitive badminton' },
  { name: 'Cricket', category: 'Sports', met: 4.8, description: 'Batting, bowling and fielding' },
  { name: 'Football / Soccer', category: 'Sports', met: 7.0, description: 'Casual football' },
  { name: 'Basketball', category: 'Sports', met: 6.5, description: 'Game play' },
  { name: 'Tennis', category: 'Sports', met: 7.3, description: 'Singles / doubles' },
  { name: 'Table Tennis', category: 'Sports', met: 4.0, description: 'Table tennis' },
  { name: 'Squash', category: 'Sports', met: 7.3, description: 'Squash' },
  { name: 'Pickleball', category: 'Sports', met: 4.8, description: 'Pickleball' },
  { name: 'Volleyball / Throwball', category: 'Sports', met: 3.5, description: 'Recreational volleyball or throwball' },
  { name: 'Kabaddi', category: 'Sports', met: 7.0, description: 'Kabaddi match play' },
  { name: 'Kho-Kho', category: 'Sports', met: 6.5, description: 'Kho-kho match play' },
  { name: 'Skating / Rollerblading', category: 'Sports', met: 7.0, description: 'Inline or roller skating' },
  { name: 'Swimming - Vigorous', category: 'Swimming', met: 9.8, description: 'Fast laps' },
  { name: 'Hiking / Trekking', category: 'Outdoor', met: 6.0, description: 'Hiking on trails or hills' },
  { name: 'Cycling - Vigorous', category: 'Cycling', met: 10.0, description: 'Fast cycling' },
  { name: 'Indoor cycling / Spin class', category: 'Cycling', met: 8.5, description: 'Studio spin class' },
  // ---- Home & gym basics
  { name: 'Skipping (jump rope)', category: 'Cardio', met: 10.0, description: 'Moderate-pace skipping' },
  { name: 'Burpees', category: 'Cardio', met: 8.0, description: 'Burpee intervals' },
  { name: 'Aerobics', category: 'Cardio', met: 6.5, description: 'General aerobics class' },
  { name: 'Elliptical trainer', category: 'Cardio', met: 5.0, description: 'Moderate effort' },
  { name: 'Rowing machine', category: 'Cardio', met: 7.0, description: 'Moderate rowing' },
  { name: 'Treadmill - Incline walk', category: 'Walking', met: 5.5, description: 'Incline walking' },
  { name: 'Bodyweight circuit', category: 'Strength', met: 5.5, description: 'Push-ups, squats, lunges and planks in a circuit' },
  { name: 'Planks / core work', category: 'Strength', met: 3.8, description: 'Core strengthening' },
  { name: 'Bhangra / Garba dance', category: 'Dance', met: 5.5, description: 'Indian folk dance' },
  { name: 'Household work (vigorous)', category: 'Daily activity', met: 3.5, description: 'Sweeping, mopping, gardening' },
];

/** Adds any activity that is missing (matched by name). Never overwrites or removes anything. */
async function seedActivities(Activity = require('../models/Activity')) {
  let added = 0;
  for (const a of ACTIVITIES) {
    const r = await Activity.updateOne({ name: a.name }, { $setOnInsert: a }, { upsert: true });
    if (r.upsertedCount) added += 1;
  }
  return { added, total: ACTIVITIES.length };
}

module.exports = { ACTIVITIES, seedActivities };
