// Tab/page transitions + skeletons.
import { Suspense } from "react";
import { useSkeleton } from "./motion";

export const Skeleton = ({ h = 16, w = "100%", r = 12, style }) => <div className="fx-skel" aria-hidden="true" style={{ height: h, width: w, "--r": `${r}px`, ...style }} />;

/** Skeleton shaped like the real screen so the layout never jumps. */
export function PageSkeleton({ variant = "dashboard" }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: "grid", gap: 14, padding: 16 }}>
      <Skeleton h={14} w={90} /><Skeleton h={30} w={220} />
      {variant === "dashboard"
        ? (<><Skeleton h={190} r={24} /><div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={96} r={18} />)}</div><Skeleton h={160} r={20} /></>)
        : [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={64} r={16} />)}
    </div>
  );
}

/** Wrap each page. Re-mounts on pageKey change, so the entrance replays (CSS fallback when View Transitions exist). */
export const PageTransition = ({ pageKey, children }) => <div key={pageKey} className="fx-page">{children}</div>;

/** Lazy-route boundary: shimmer skeleton instead of "Loading…". */
export const PageSuspense = ({ children, variant }) => <Suspense fallback={<PageSkeleton variant={variant} />}>{children}</Suspense>;

/** Data-driven swap: <Reveal loading={loading} skeleton={<PageSkeleton/>}>{content}</Reveal>. Children get staggered via --i. */
export function Reveal({ loading, skeleton, children }) {
  const showSkel = useSkeleton(loading);
  if (loading && !showSkel) return null;           // fast loads: nothing flashes
  if (showSkel) return skeleton;
  return <div className="fx-reveal">{children}</div>;
}
