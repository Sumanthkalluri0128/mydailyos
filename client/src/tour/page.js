// Which page the app is showing (App.jsx reports it), so hints and the help "?" know where they are.
import { useSyncExternalStore } from "react";
let page = "dashboard";
const subs = new Set();
export const setTourPage = (p) => { if (p !== page) { page = p; subs.forEach((f) => f()); } };
export const getPage = () => page;
export const usePage = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => page, () => page);
// web page id -> the screen name used by the coachmarks in tourContent.json
export const SCREEN_OF = { foodLogger: "log", planner: "planner", progress: "progress", task: "tasks", profile: "profile" };
// tour route name -> web page id
export const PAGE_OF = { home: "dashboard", food: "foodLogger", weight: "weight", exercise: "exercise", plan: "planner", progress: "progress" };
