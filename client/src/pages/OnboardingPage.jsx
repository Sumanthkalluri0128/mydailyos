import { useState } from "react";
import { apiFetch } from "../config/api";
import { API_URL } from "../config";

// First-run screen: shows the details we already have (the name comes from the Google/Gmail account or sign-up)
// as EDITABLE fields, so people confirm or change them instead of the app silently keeping them.
export default function OnboardingPage({ profile, onDone }) {
  const [form, setForm] = useState({
    name: profile?.name || "",
    age: profile?.age ?? "",
    sex: profile?.sex || "",
    heightCm: profile?.heightCm ?? "",
    currentWeightKg: profile?.currentWeightKg ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const num = (x) => (x === "" || x === null ? null : Number(x));

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Please enter your name."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`${API_URL}/api/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          age: num(form.age),
          sex: form.sex,
          heightCm: num(form.heightCm),
          currentWeightKg: num(form.currentWeightKg),
          onboarded: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || "Could not save");
      onDone(data.profile);
    } catch (err) {
      setError(err.message || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding">
      <form className="onboarding-card" onSubmit={save}>
        <h2>Welcome to FlexFit 👋</h2>
        <p className="onboarding-sub">Confirm your details. You can change any of them later in Profile.</p>

        <label>Name
          <input value={form.name} onChange={set("name")} maxLength={100} autoFocus />
        </label>
        <div className="onboarding-row">
          <label>Age
            <input type="number" min="1" max="120" value={form.age} onChange={set("age")} />
          </label>
          <label>Sex
            <select value={form.sex} onChange={set("sex")}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <div className="onboarding-row">
          <label>Height (cm)
            <input type="number" min="50" max="250" value={form.heightCm} onChange={set("heightCm")} />
          </label>
          <label>Weight (kg)
            <input type="number" min="1" max="700" step="0.1" value={form.currentWeightKg} onChange={set("currentWeightKg")} />
          </label>
        </div>

        {error && <div className="onboarding-error">{error}</div>}
        <button className="onboarding-btn" disabled={saving}>{saving ? "Saving…" : "Continue"}</button>
      </form>
    </div>
  );
}
