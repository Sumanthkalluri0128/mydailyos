// The "Rookie" sticker: an original badge (a fresh sprout on a headband), unlocked when the first-week checklist is complete.
export default function RookieSticker({ size = 96, label = true }) {
  return (
    <figure className="tr-sticker" style={{ width: size, margin: 0, textAlign: "center" }} aria-label="Rookie sticker">
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-hidden="true">
        <defs><linearGradient id="rkbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8be28b" /><stop offset="1" stopColor="#2fb7a0" /></linearGradient></defs>
        <circle cx="60" cy="60" r="54" fill="url(#rkbg)" stroke="#fff" strokeWidth="6" />
        <rect x="26" y="66" width="68" height="14" rx="7" fill="#1c4d7a" /><path d="M34 73h52" stroke="#fff" strokeWidth="3" strokeDasharray="2 5" strokeLinecap="round" />
        <path d="M60 66V44" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <path d="M60 50c-14 0-22-8-22-20 14 0 22 8 22 20z" fill="#fff" /><path d="M60 46c12 0 20-6 20-17-12 0-20 6-20 17z" fill="#e9ffe9" />
        <path d="M92 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" />
      </svg>
      {label && <figcaption style={{ fontWeight: 700 }}>Rookie</figcaption>}
    </figure>
  );
}
