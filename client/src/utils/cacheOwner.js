// Anything cached in this browser belongs to ONE person (the signed-in email). A different person signing in on the same
// browser (or the same person arriving through Google instead of a password) must never be shown someone else's saved copy.
export function currentOwner() {
  try {
    return String(JSON.parse(localStorage.getItem("mydailyos_user") || "null")?.email || "").trim().toLowerCase();
  } catch {
    return "";
  }
}
