import { API_URL } from "../config";
import { makeReporter } from "./telemetry";

// fire-and-forget; `keepalive` lets the last report leave even when the tab is closing
const reporter = makeReporter({
  send: (body) => fetch(`${API_URL}/api/telemetry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }),
});
export const report = reporter.report;
if (typeof window !== "undefined") window.addEventListener("pagehide", () => reporter.flush());
