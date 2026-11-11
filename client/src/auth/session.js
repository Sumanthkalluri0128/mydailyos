// How the website remembers you are signed in. Two modes, chosen at build time:
//  - classic (default): the sign-in token is kept in localStorage and sent as "Authorization: Bearer ...".
//  - cookie  (VITE_COOKIE_AUTH=1, needs COOKIE_AUTH=1 on the server): the token lives ONLY in an httpOnly cookie that page scripts cannot read.
//    The page keeps just a harmless "signed in" marker, and sends a CSRF header with every request.
export const COOKIE_MODE = (import.meta.env && import.meta.env.VITE_COOKIE_AUTH) === "1";
const TOKEN = "mydailyos_token";
const MARK = "mydailyos_session";

export function readCookie(name) {
  if (typeof document === "undefined") return "";
  const hit = document.cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  try { return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ""; } catch { return ""; }
}

/** The token to send as a Bearer header (classic mode only). */
export const getToken = () => (COOKIE_MODE ? null : localStorage.getItem(TOKEN));
/** Is someone signed in on this browser? */
export const isSignedIn = () => (COOKIE_MODE ? localStorage.getItem(MARK) === "1" : !!localStorage.getItem(TOKEN));
/** After a successful sign-in. In cookie mode the token never reaches this code: only the marker is kept. */
export function startSession(token) {
  if (COOKIE_MODE) { localStorage.setItem(MARK, "1"); localStorage.removeItem(TOKEN); } else if (token) localStorage.setItem(TOKEN, token);
}
export function endSession() {
  localStorage.removeItem(TOKEN); localStorage.removeItem(MARK);
  if (COOKIE_MODE) logoutServer();
}
/** Cookie mode: ask the server to remove the httpOnly cookie (page scripts cannot). Fire and forget. */
function logoutServer() {
  import("../config").then(({ API_URL }) => fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include", headers: { "X-CSRF-Token": readCookie("mdos_csrf") } }).catch(() => {})).catch(() => {});
}
/** Extra request settings for cookie mode (nothing in classic mode). */
export const requestExtras = () => (COOKIE_MODE ? { credentials: "include", headers: { "X-CSRF-Token": readCookie("mdos_csrf") } } : { headers: {} });
/** Sign-in / sign-up requests ask the server to answer with a cookie instead of a token. */
export const signInExtras = () => (COOKIE_MODE ? { credentials: "include", headers: { "X-Session": "cookie" } } : { headers: {} });
