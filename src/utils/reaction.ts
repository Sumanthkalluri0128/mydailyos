// Which character reacts to what you just did — pure and deterministic so it can be tested.
// Goku powers up when the workout goal is met, Zoro trains when steps are low, Luffy eats once lunch is logged,
// Jin-Woo levels up on a long streak. Anything else falls back to the day's own character.
import type { BuddyScene } from '../motion/Buddy';
import type { Who } from '../motion/chars';

export type ReactionInput = {
  hour: number; exerciseMin: number; exerciseTarget: number; steps: number; stepsTarget: number;
  lunchLogged: boolean; streakDays: number;
};
export type Reaction = { who?: Who; scene: BuddyScene; says?: string };

export function reactionFor(i: ReactionInput): Reaction | null {
  if (i.exerciseTarget > 0 && i.exerciseMin >= i.exerciseTarget) return { who: 'goku', scene: 'powerup', says: 'Power level rising!' };
  if (i.streakDays >= 7 && i.streakDays % 7 === 0) return { who: 'jinwoo', scene: 'levelup', says: `${i.streakDays}-day streak. Level up!` };
  if (i.lunchLogged && i.hour >= 12 && i.hour < 17) return { who: 'luffy', scene: 'eat', says: 'Lunch logged. Meat!' };
  if (i.stepsTarget > 0 && i.hour >= 15 && i.steps / i.stepsTarget < 0.4) return { who: 'zoro', scene: 'run', says: 'Training time. Join me?' };
  return null;
}
