# Phase 3 / Section B: goals, targets and badges (one goal, one focus, one level, one shelf)

## Before / after: what moved where
| Before | After |
|---|---|
| Home: Level + 4 quests, Fat-loss card (north star, corridor, score, focus habits, rewards) | Home: one Your Progress card (level, next-level XP, 3 quests) and one Your goal card (X kg done of Y kg, status, date range) |
| North Star 'expected corridor' | Plain status: Ahead of plan / On track / A little behind, plus a likely finish date RANGE |
| Fat-loss score out of 100 (Home card) | Weekly score with 3 parts (Food, Movement, Habits) under Details; also shown in the Weekly review |
| Daily quests (5), Today's moves, quests on Home | ONE list: calories, protein, water (steps is a bonus). One reward when all three are done |
| Level + XP | Same level (old XP formula reproduced exactly) + 15 XP per all-quests day + 30 XP per comeback; the highest XP shown is stored so a level never drops |
| Badges: 10 streak + 11 total (achievements) and 7 bronze/silver/gold families (outcomes), shown in 3 places | 16 badge families with 1-4 tiers each, 4 shelves (Consistency, Nutrition, Training, Milestones), rarity common/rare/epic/legendary. Main view: next badge, last earned, See all |
| Targets spread over Profile, Goals and North Star | Targets block on the Goals screen: Basic (calories, protein, water, steps, goal weight) and Advanced (macro split, fibre, sugar, sodium, phase) with Why this number? and Use recommended |
| Weight journey, weekly chapter, sticker packs on Goals | Sticker packs, album and week path are folded away; the weight journey is the goal card |
| Streak resets after one quiet day | One rest-day token per Mon-Sun week is spent automatically; coming back after 3+ quiet days earns a bonus |

## Old badge -> new badge (nothing earned is lost; tested against real fixtures)
| Old badge id | New badge | Tier |
|---|---|---|
| log-7 | Logging streak (consistency) | tier 1 of 3 |
| log-30 | Logging streak (consistency) | tier 2 of 3 |
| log-100 | Logging streak (consistency) | tier 3 of 3 |
| water-3 | Water streak (consistency) | tier 1 of 3 |
| water-7 | Water streak (consistency) | tier 2 of 3 |
| water-30 | Water streak (consistency) | tier 3 of 3 |
| habit-7 | Habit streak (consistency) | tier 1 of 2 |
| habit-30 | Habit streak (consistency) | tier 2 of 2 |
| habits-50 | Habit check-offs (consistency) | tier 1 of 1 |
| comeback | Comeback (consistency) | tier 1 of 3 |
| protein-week | Protein weeks (nutrition) | tier 1 of 3 |
| deficit | Steady energy (nutrition) | tier 1 of 3 |
| meals-50 | Mindful eater (nutrition) | tier 1 of 1 |
| water-100l | Water total (nutrition) | tier 1 of 1 |
| workout-3 | Workout streak (training) | tier 1 of 2 |
| workout-7 | Workout streak (training) | tier 2 of 2 |
| workouts-1 | Workouts (training) | tier 1 of 3 |
| workouts-10 | Workouts (training) | tier 2 of 3 |
| workouts-50 | Workouts (training) | tier 3 of 3 |
| muscle | Muscle guard (training) | tier 1 of 3 |
| fat-kg | Weight change (milestones) | tier 1 of 3 |
| fat-pct | Weight change (milestones) | tier 1 of 3 |
| waist | Waist (milestones) | tier 1 of 3 |
| tasks-1 | Tasks done (milestones) | tier 1 of 4 |
| tasks-10 | Tasks done (milestones) | tier 2 of 4 |
| tasks-30 | Tasks done (milestones) | tier 3 of 4 |
| tasks-100 | Tasks done (milestones) | tier 4 of 4 |
| weighins-10 | Weigh-ins (milestones) | tier 1 of 1 |

Notes: 'fat-kg' and 'fat-pct' were near-duplicates; the new Weight change badge unlocks a tier when EITHER measure reaches it (kg 1/5/10 or 2/5/10 percent). Old bronze/silver/gold tier N becomes tier N.

## New / changed routes
- GET /api/goals/simple?today= : whole payload (goal, focus, level, streak, weeklyScore, badges, targets, recap, copy).
- POST /api/goals/check-target {key, value}: the existing safety rules (calorie floor 1200/1500, healthy BMI floor, sane limits).
- GET /api/goals/journey now returns the same level and the same 3 quests (the characters read it).
- PATCH /api/profile records goal changes in Profile.targetHistory (last 50) -> the calm 'Updated your ... target because ...' line.
- Profile gets journey.xpFloor, journey.earnedAt, targetHistory. No migration needed.
