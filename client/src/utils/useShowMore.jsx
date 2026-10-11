import { useState } from "react";

// Long history lists start with the newest few entries; one click shows the rest and the same button folds them away again.
export default function useShowMore(items, limit = 3) {
  const [open, setOpen] = useState(false);
  return { shown: open ? items : items.slice(0, limit), hidden: Math.max(0, items.length - limit), open, toggle: () => setOpen((o) => !o) };
}

export function ShowMoreButton({ hidden, open, onClick, noun = "days" }) {
  if (hidden <= 0) return null;
  return (
    <button type="button" className="secondary-button show-more-button" onClick={onClick} aria-expanded={open}>
      {open ? "Show less ⌃" : `Show ${hidden} more ${noun} ⌄`}
    </button>
  );
}
