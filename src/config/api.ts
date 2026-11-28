import * as SecureStore from 'expo-secure-store';

import Constants from 'expo-constants';
import { announceWrite } from '../tour/events';
import { beginRequest, endRequest, noteRetry } from '../utils/netActivity';

// Backend URL. Override without touching code via EXPO_PUBLIC_API_URL (eas.json / .env) or
// app.json -> expo.extra.apiUrl. The default is the existing Render service; after you rename it to a
// FlexFit URL (see docs/RENAME_BACKEND.md) just set EXPO_PUBLIC_API_URL, no code change needed.
const DEFAULT_API_URL = 'https://mydailyos-268d.onrender.com';
export const API_URL = String(
  process.env.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra as any)?.apiUrl || DEFAULT_API_URL
).replace(/\/+$/, '');
export const TOKEN_KEY = 'mydailyos_token';
export const USER_KEY = 'mydailyos_user';

// Keep the auth token in memory after the first read. SecureStore remains the
// source of truth, but avoiding a SecureStore lookup on every request makes
// tab changes and button actions noticeably faster.
let memoryToken: string | null | undefined;

export class ApiError extends Error {
  status: number;
  data: any;
  /** True when the request never reached the server (offline, DNS, timeout). */
  network: boolean;
  constructor(message: string, status = 0, data: any = {}, network = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.network = network;
  }
}

/** Short random id attached to creates so a replayed offline write can never duplicate. */
export function newClientId(prefix = 'c'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Render's free instance sleeps after ~15 min idle and takes ~50 s to wake. With the old 20 s timeout the first
// requests after a quiet spell were aborted and reported as "You appear to be offline" even with full signal.
const REQUEST_TIMEOUT_MS = 55000;

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

const WAKING_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GETs are safe to repeat, so while the free host is still waking up (502/503/504 or a dropped connection) try again a few times
 * with a growing pause instead of surfacing "Something went wrong" for what is really just a cold start. */
async function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  const tries = isGet ? 4 : 1;
  const activity = beginRequest({ write: !isGet }); // drives the "Saving... / still working" pill (components/NetworkActivity.tsx)
  let lastErr: unknown;
  try {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      try {
        return await requestOnce<T>(path, options, authenticated);
      } catch (e: any) {
        lastErr = e;
        const waking = e instanceof ApiError && WAKING_STATUS.has(e.status);
        if (!waking || attempt === tries - 1) throw e;
        noteRetry(activity); // tells the person the server is waking up instead of leaving a silent wait
        await sleep(1500 * (attempt + 1) ** 2); // 1.5 s, 6 s, 13.5 s
      }
    }
    throw lastErr;
  } finally {
    endRequest(activity);
  }
}

async function requestOnce<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const token = authenticated
    ? memoryToken !== undefined
      ? memoryToken
      : (memoryToken = await SecureStore.getItemAsync(TOKEN_KEY))
    : null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      signal: controller.signal,
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    });
  } catch (e: any) {
    throw new ApiError(
      e?.name === 'AbortError' ? 'The server took too long to respond.' : 'You appear to be offline.',
      0, {}, true
    );
  } finally {
    clearTimeout(timer);
  }

  const data: any = await parseResponse(response);

  if (response.status === 401 && authenticated) {
    await clearSession();
  }

  if (!response.ok) {
    throw new ApiError(data.message || `Request failed (${response.status})`, response.status, data);
  }
  // The tour hears about real actions (a logged glass of water, a planned day) from here; nothing leaves the phone.
  if (options.method && options.method.toUpperCase() !== 'GET') announceWrite(options.method, path);
  return data as T;
}

/** Used by the offline queue: performs any write and reports the outcome (and response body) without throwing. */
export async function sendRaw(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; network: boolean; message?: string; data?: any }> {
  try {
    const data = await request<any>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: true, status: 200, network: false, data };
  } catch (e: any) {
    if (e instanceof ApiError) return { ok: false, status: e.status, network: e.network, message: e.message };
    return { ok: false, status: 0, network: true, message: e?.message };
  }
}

/** Wakes a sleeping free-tier server in the background so the first real request doesn't wait ~50 s. */
let lastWarm = 0;
export function warmUp(): void {
  const now = Date.now();
  if (now - lastWarm < 20_000) return; // several parts of the app ask at launch; one ping is enough
  lastWarm = now;
  fetch(`${API_URL}/api/health`, { method: 'GET' }).catch(() => {});
}
// Start waking the server the instant this module loads (before any screen has even rendered).
warmUp();

export const get = <T,>(path: string) => request<T>(path);
export const post = <T,>(path: string, body: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T,>(path: string, body: any = {}) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T,>(path: string, body: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T,>(path: string) => request<T>(path, { method: 'DELETE' });

// Auth endpoints intentionally do not require an existing token.
export const authPost = <T,>(path: string, body: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }, false);

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Authorization header for raw downloads (e.g. the PDF report), or {} when signed out. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = memoryToken !== undefined ? memoryToken : (memoryToken = await SecureStore.getItemAsync(TOKEN_KEY));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Raw fetch of a text file (CSV export) with auth. */
export async function getText(path: string): Promise<string> {
  const token = memoryToken !== undefined ? memoryToken : (memoryToken = await SecureStore.getItemAsync(TOKEN_KEY));
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('You appear to be offline.', 0, {}, true);
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).message || msg; } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.text();
}

export async function hasSession(): Promise<boolean> {
  if (memoryToken) return true;
  memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return !!memoryToken;
}

export async function saveSession(token: string, user: unknown) {
  memoryToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearSession() {
  memoryToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function getStoredUser<T = any>(): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
