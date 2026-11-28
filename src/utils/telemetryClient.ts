import { API_URL } from '../config/api';
import { makeReporter } from './telemetry';

// Aggregate health numbers only (no account, no content). Batched, fire-and-forget, never throws.
const reporter = makeReporter({
  send: (body: Record<string, number>) => fetch(`${API_URL}/api/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});
export const report: (r: { syncFailed?: number; writesDropped?: number; wakeMs?: number }) => void = reporter.report;
