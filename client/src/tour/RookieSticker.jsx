// The "Rookie" sticker: an original badge (a white belt tied in a knot on an orange disc). Unlocked when the tour is finished.
export default function RookieSticker({ size = 88, label = true }) {
  return (
    <figure className="tr-sticker" style={{ width: size }} aria-label="Rookie sticker">
      <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
        <defs><linearGradient id="rkbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd37a" /><stop offset="1" stopColor="#ff7a59" /></linearGradient></defs>
        <circle cx="60" cy="60" r="54" fill="url(#rkbg)" stroke="#fff" strokeWidth="6" />
        <circle cx="60" cy="60" r="54" fill="none" stroke="#d9552f" strokeWidth="2" strokeDasharray="4 5" />
        <path d="M18 70 L50 52 L56 60 L24 80 Z" fill="#fff" /><path d="M102 70 L70 52 L64 60 L96 80 Z" fill="#f3efe9" />
        <rect x="46" y="48" width="28" height="24" rx="6" fill="#fff" stroke="#e7dfd3" strokeWidth="2" />
        <path d="M54 60h12" stroke="#d9552f" strokeWidth="3" strokeLinecap="round" />
        <path d="M92 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" />
      </svg>
      {label && <figcaption>Rookie</figcaption>}
    </figure>
  );
}
