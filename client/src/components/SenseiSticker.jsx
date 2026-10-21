// The "Meal Sensei" sticker: an original badge (a chef's hat over a ladle and a sparkle), unlocked when the Planning sensei setup is finished.
export default function SenseiSticker({ size = 96, label = true }) {
  return (
    <figure className="sn-sticker" style={{ width: size }} aria-label="Meal Sensei sticker">
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-hidden="true">
        <defs><linearGradient id="snbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd37a" /><stop offset="1" stopColor="#ff8f5a" /></linearGradient></defs>
        <circle cx="60" cy="60" r="54" fill="url(#snbg)" stroke="#fff" strokeWidth="6" />
        <circle cx="60" cy="60" r="54" fill="none" stroke="#e8743b" strokeWidth="2" strokeDasharray="4 5" />
        <path d="M36 62c-9-3-12-16-3-21 2-9 14-12 21-5 5-7 17-5 21 4 9 1 13 13 5 19v6H36z" fill="#fff" />
        <rect x="38" y="66" width="44" height="12" rx="3" fill="#f3efe9" />
        <path d="M44 84h32" stroke="#6b4a2e" strokeWidth="4" strokeLinecap="round" />
        <path d="M60 88v14" stroke="#6b4a2e" strokeWidth="4" strokeLinecap="round" /><ellipse cx="60" cy="104" rx="8" ry="5" fill="#6b4a2e" />
        <path d="M92 28l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" />
      </svg>
      {label && <figcaption>Meal Sensei</figcaption>}
    </figure>
  );
}
