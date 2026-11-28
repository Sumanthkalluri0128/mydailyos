export type GuideItem = { id: string; label: string; amount: number; unit: string; scale: number };
export type Guide = { id: string; title: string; note: string; items: GuideItem[] };
export const GUIDES: Guide[];
export function guideText(g: Guide, i: GuideItem): string;
