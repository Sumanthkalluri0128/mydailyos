// Small shared cache for the person's profile (goals + unit preferences), so every screen that
// needs `units.weight` or a goal target doesn't each fire their own /api/profile request.
import { useEffect, useState } from 'react';
import { read, write } from '../utils/offline';
import { deepMerge } from '../utils/optimistic';

export type Units = { weight: 'kg' | 'lb'; energy: 'kcal' | 'kJ'; volume: 'ml' | 'oz' };
export type Goals = {
  calorieTarget: number; proteinTarget: number; waterTargetMl: number;
  stepsTarget: number; exerciseMinutesTarget: number; targetWeightKg: number | null; weeklyPaceKg?: number | null; calorieMode?: 'auto' | 'manual'; calorieFloor?: number | null; };
export type Profile = {
  name: string; age: number | null; sex: string; heightCm: number | null; currentWeightKg: number | null;
  activityLevel: string; goals: Goals; units: Units; onboarded: boolean;
  activityMode?: 'auto' | 'manual'; autoActivity?: { targetLevel?: string | null; multiplier?: number | null; windowDays?: number | null } | null;
  measuredTdee?: { ratio?: number | null; confidence?: string | null } | null; ageSetAt?: string | null;
};

const DEFAULT_UNITS: Units = { weight: 'kg', energy: 'kcal', volume: 'ml' };
let cached: Profile | null = null;
const listeners = new Set<(p: Profile | null) => void>();

function setCached(p: Profile | null) {
  cached = p;
  listeners.forEach((l) => l(p));
}

export async function refreshProfile(): Promise<Profile | null> {
  try {
    const res = await read<{ profile: Profile }>('/api/profile');
    setCached(res.profile);
    return res.profile;
  } catch {
    return cached;
  }
}

/** Saves profile changes. Works offline: the change is queued and shown immediately, then synced. */
export async function updateProfile(patchBody: Record<string, any>): Promise<Profile> {
  const r = await write<{ profile: Profile }>('PATCH', '/api/profile', patchBody, 'Profile settings');
  const next = r.queued ? (deepMerge(cached || {}, patchBody) as Profile) : r.data.profile;
  setCached(next);
  return next;
}

export function clearProfileCache() { setCached(null); }

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(cached);
  useEffect(() => {
    listeners.add(setProfile);
    if (!cached) refreshProfile();
    return () => { listeners.delete(setProfile); };
  }, []);
  return { profile, units: profile?.units || DEFAULT_UNITS, goals: profile?.goals, refresh: refreshProfile };
}
