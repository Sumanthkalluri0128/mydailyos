// Large-text mode (this device only). Scales the whole page with CSS zoom, and gives buttons a bigger minimum size.
import { useEffect, useState } from "react";
const KEY = "ff-large-text";
const subs = new Set();
let on = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
const apply = () => { try { document.documentElement.classList.toggle("ff-large", on); } catch { /* ignore */ } };
apply();
export const isLarge = () => on;
export function setLarge(v) { on = !!v; try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode */ } apply(); subs.forEach((f) => f(on)); }
export function useLarge() { const [v, setV] = useState(on); useEffect(() => { subs.add(setV); return () => subs.delete(setV); }, []); return v; }
