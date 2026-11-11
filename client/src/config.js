const rawApiUrl =
  import.meta.env.API_URL || "https://mydailyos.onrender.com";

export const API_API_URL = rawApiUrl.replace(/\/+$/, "");
// Cookie mode talks to the SAME address as the page (/api/... is forwarded to the server by vercel.json), so the session cookie is first-party and
// Safari / Chrome do not block it. Classic mode talks to the server address directly, as before.
export const API_URL = (import.meta.env && import.meta.env.VITE_COOKIE_AUTH) === "1" ? "" : API_API_URL;
