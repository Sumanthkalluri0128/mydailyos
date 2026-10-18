// A collapsible block for Home: a one-line summary when closed, the full feature when open. Remembers what you opened.
import { useState } from "react";

export default function HomeSection({ id, icon, title, summary, defaultOpen = false, children }) {
  const key = `ff_home_${id}`;
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(key); return v === null ? defaultOpen : v === "1"; } catch { return defaultOpen; } });
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* private mode */ } };
  return (
    <section className={`hs ${open ? "is-open" : ""}`}>
      <button type="button" className="hs-head" onClick={toggle} aria-expanded={open}>
        <span className="hs-ic" aria-hidden="true">{icon}</span>
        <span className="hs-t"><b>{title}</b>{summary && <small>{summary}</small>}</span>
        <span className="hs-chev" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && <div className="hs-body">{children}</div>}
    </section>
  );
}
