import { API_URL } from "../config";

export function clearSession() {
  localStorage.removeItem("mydailyos_token");
  localStorage.removeItem("mydailyos_user");
}

export async function apiFetch(input, options = {}) {
  const token = localStorage.getItem("mydailyos_token");
  const headers = new Headers(options.headers || {});

  headers.set("Accept", "application/json");

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url =
    typeof input === "string" && input.startsWith("/")
      ? `${API_URL}${input}`
      : input;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && token) {
    clearSession();
    window.dispatchEvent(new Event("mydailyos:unauthorized"));
  }

  return response;
}
