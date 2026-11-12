// Saves a text file from the browser (CSV / JSON) without any server: builds a Blob and clicks a temporary link.
export function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener"; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const gymFileName = (kind, stamp = new Date().toISOString().slice(0, 10)) =>
  ({ "workouts-csv": `flexfit-gym-workouts-${stamp}.csv`, "body-csv": `flexfit-body-measurements-${stamp}.csv`, "backup-json": `flexfit-gym-backup-${stamp}.json` })[kind];
export const gymMime = (kind) => (kind === "backup-json" ? "application/json" : "text/csv");
