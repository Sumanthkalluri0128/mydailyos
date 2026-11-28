// Types for the shared content file (the .js file is byte-identical to the web copy; do not edit it here).
export type TourStep = { screen: string; anchor: string; title: string; text: string; event: string | null; cheer: string };
export type TourHint = { id: string; anchor: string | null; text: string };
export type TourContent = {
  version: number;
  welcome: { id: string; emoji: string; title: string; text: string; choice?: 'goal' | 'coach' }[];
  goals: { id: string; label: string }[];
  steps: Record<string, TourStep>;
  paths: Record<string, string[]>;
  checklist: { id: string; label: string; event: string }[];
  checklistReward: { text: string; sticker: string };
  hints: Record<string, TourHint[]>;
  whatsNew: { id: string; since: string; anchor: string; text: string }[];
  events: { method: string; prefix: string; event: string; not?: string[] }[];
};
declare const content: TourContent;
export default content;
