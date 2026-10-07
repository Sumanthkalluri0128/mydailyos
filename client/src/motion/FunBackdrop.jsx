// Animated page background: drifting aurora blobs, sakura petals, twinkling stars and the odd shooting star.
// Pure CSS, no dependencies. Sits behind everything (z-index -1) and ignores clicks.
const PETALS = Array.from({ length: 14 }, (_, i) => ({ left: (i * 73) % 100, size: 8 + ((i * 5) % 9), dur: 12 + ((i * 7) % 10), delay: -((i * 3.1) % 14) }));
const STARS = Array.from({ length: 22 }, (_, i) => ({ left: (i * 47) % 100, top: (i * 31) % 100, dur: 2 + ((i * 3) % 4), delay: -((i * 0.7) % 5) }));

export default function FunBackdrop() {
  return (
    <div className="fb" aria-hidden="true">
      <i className="fb-blob fb-b1" /><i className="fb-blob fb-b2" /><i className="fb-blob fb-b3" />
      {STARS.map((s, i) => <i key={`s${i}`} className="fb-star" style={{ left: `${s.left}%`, top: `${s.top}%`, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }} />)}
      {PETALS.map((p, i) => <i key={`p${i}`} className="fb-petal" style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />)}
      <i className="fb-shoot" /><i className="fb-shoot fb-shoot2" />
    </div>
  );
}
