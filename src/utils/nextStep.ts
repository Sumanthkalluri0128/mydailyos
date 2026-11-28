// Adaptive Home step (server rules in lib/nextStep.js). Returns null until the server answers, so Home falls back to its local coach line.
import { useEffect, useState } from 'react';
import { post } from '../config/api';

export type Step = { id: string; text: string; scene: string; cta: { label: string; page: string | null } | null };
export function useNextStep(p: { hour: number; meals: any; waterMl: number; waterTargetMl: number; steps: number; stepsTarget: number; budget: number; eaten: number }, tick: any): Step | null {
  const [step, setStep] = useState<Step | null>(null);
  useEffect(() => {
    let alive = true;
    post<any>('/api/coach/next-step', p).then((d) => { if (alive && d?.success) setStep(d.step); }).catch(() => {});
    return () => { alive = false; };
  }, [tick, p.hour]); // eslint-disable-line react-hooks/exhaustive-deps
  return step;
}
// Where each CTA goes (page ids are the web ids; mobile routes are different).
export const ROUTE: Record<string, string> = { foodLogger: '/food', water: '/water', exercise: '/exercise', weight: '/weight', planner: '/plan' };
