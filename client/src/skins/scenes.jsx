// Painted-style scenes behind each banner (inline SVG, 1200 x 300). One per theme, matching the reference designs:
// cozy blossom room, mountain sunset, sunny sea sky, tidy study, neon city, gym, forest road, cliff in the mist.
// Want real artwork instead? Drop a picture at public/skins/<theme id>.webp (e.g. f-cozy.webp) and it is used automatically.

const Pine = ({ x, y, s = 1, c = "#2f5d46" }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={c}>
    <path d="M0 -90 L26 -40 L12 -40 L34 0 L-34 0 L-12 -40 L-26 -40 Z" /><rect x="-4" y="0" width="8" height="14" fill="#4a3426" />
  </g>
);
const Cloud = ({ x, y, s = 1, o = 0.9 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity={o}>
    <ellipse cx="0" cy="0" rx="46" ry="16" /><ellipse cx="-22" cy="-10" rx="24" ry="16" /><ellipse cx="14" cy="-16" rx="28" ry="20" />
  </g>
);
const Blossom = ({ x, y, r = 14, c = "#ffb3d1" }) => (
  <g><circle cx={x} cy={y} r={r} fill={c} /><circle cx={x + r * 0.7} cy={y - r * 0.4} r={r * 0.7} fill="#ffd0e3" /><circle cx={x - r * 0.6} cy={y + r * 0.5} r={r * 0.6} fill="#ff9cc3" /></g>
);
const Building = ({ x, w, h, c, lit = "#c9a6ff" }) => (
  <g>
    <rect x={x} y={300 - h} width={w} height={h} fill={c} />
    {Array.from({ length: Math.floor(h / 26) }).map((_, r) => Array.from({ length: Math.floor(w / 22) }).map((__, k) => ((r * 7 + k * 3 + x) % 5 < 2) ? <rect key={`${r}-${k}`} x={x + 6 + k * 22} y={300 - h + 10 + r * 26} width="9" height="12" fill={lit} opacity="0.85" /> : null))}
  </g>
);

const SCENES = {
  "f-cozy": () => (<>
    <rect width="1200" height="300" fill="url(#g-cozy)" />
    <defs><linearGradient id="g-cozy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe0ef" /><stop offset="0.55" stopColor="#f6d6f6" /><stop offset="1" stopColor="#e1d4ff" /></linearGradient></defs>
    <rect x="600" y="26" width="360" height="230" rx="26" fill="#fff" opacity="0.55" /><rect x="600" y="26" width="360" height="230" rx="26" fill="none" stroke="#fff" strokeWidth="8" opacity="0.8" /><path d="M780 26V256M600 140H960" stroke="#fff" strokeWidth="6" opacity="0.8" />
    <path d="M1200 20 C1100 40 1040 70 980 120 M1100 40 C1090 90 1060 120 1010 150" stroke="#8a5a4a" strokeWidth="7" fill="none" strokeLinecap="round" />
    {[[1150, 40], [1110, 70], [1060, 90], [1020, 130], [1130, 110], [1080, 150], [990, 110], [1180, 90]].map(([x, y], i) => <Blossom key={i} x={x} y={y} r={20 - (i % 3) * 3} />)}
    <path d="M0 260 H1200 V300 H0Z" fill="#e9c9b0" opacity="0.7" /><path d="M0 262 H1200" stroke="#fff" strokeWidth="3" opacity="0.6" />
    <g transform="translate(520 272) scale(0.8)"><rect x="-26" y="-34" width="52" height="34" rx="6" fill="#d98c6a" /><path d="M0 -34 C-30 -90 -50 -60 -30 -110 M0 -34 C10 -100 40 -80 30 -120 M0 -34 C-6 -80 4 -110 0 -130" stroke="#5fae6a" strokeWidth="9" fill="none" strokeLinecap="round" /></g>
    {[[300, 60], [480, 150], [700, 90], [900, 200]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="7" ry="4" fill="#ffb3d1" transform={`rotate(${30 + i * 25} ${x} ${y})`} />)}
  </>),

  "f-scenic": () => (<>
    <defs><linearGradient id="g-sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9db4ff" /><stop offset="0.55" stopColor="#d9c4f5" /><stop offset="1" stopColor="#ffcfa8" /></linearGradient></defs>
    <rect width="1200" height="300" fill="url(#g-sc)" />
    <circle cx="930" cy="150" r="70" fill="#fff3cf" opacity="0.9" /><circle cx="930" cy="150" r="110" fill="#ffd9a0" opacity="0.35" />
    <path d="M0 230 L110 120 L190 190 L300 70 L420 200 L540 110 L660 210 L780 100 L900 200 L1020 120 L1120 190 L1200 140 V300 H0Z" fill="#8e8bd6" opacity="0.85" />
    <path d="M0 260 L130 170 L240 240 L380 150 L520 250 L660 180 L820 255 L980 175 L1100 245 L1200 200 V300 H0Z" fill="#5e63b4" />
    <path d="M0 290 L160 230 L320 285 L520 235 L720 288 L940 240 L1200 290 V300 H0Z" fill="#3c4390" />
    {[60, 120, 170, 1040, 1100, 1160].map((x, i) => <Pine key={x} x={x} y={296} s={0.8 + (i % 3) * 0.2} c="#2a3a6e" />)}
    <Cloud x={300} y={70} s={1.1} o={0.7} /><Cloud x={760} y={50} s={0.8} o={0.6} />
    <path d="M820 300 L860 262 L1010 262 L1050 300Z" fill="#6b5a7a" /><path d="M860 262 L1010 262" stroke="#8a789a" strokeWidth="4" />
  </>),

  "f-fun": () => (<>
    <defs><linearGradient id="g-fun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fd2ff" /><stop offset="0.7" stopColor="#c8efff" /><stop offset="1" stopColor="#fff2c2" /></linearGradient></defs>
    <rect width="1200" height="300" fill="url(#g-fun)" />
    <g opacity="0.55" transform="translate(870 140)">{Array.from({ length: 16 }).map((_, i) => <path key={i} d="M0 0 L520 -26 L520 26Z" fill="#fff" transform={`rotate(${i * 22.5})`} />)}</g>
    <Cloud x={160} y={70} s={1.4} /><Cloud x={420} y={110} s={1} /><Cloud x={1040} y={60} s={1.2} /><Cloud x={640} y={44} s={0.9} />
    <path d="M0 240 C150 215 300 262 450 240 C600 218 750 262 900 240 C1050 218 1150 250 1200 238 V300 H0Z" fill="#4aa9e8" />
    <path d="M0 268 C150 246 300 290 450 268 C600 248 750 290 900 268 C1050 248 1150 276 1200 266 V300 H0Z" fill="#2e86d0" />
    <path d="M560 228 h86 l-10 22 h-66z" fill="#c0392b" /><path d="M603 228 V160 M603 168 L650 196 L603 214Z" stroke="#7a4a2a" strokeWidth="5" fill="#fff" />
  </>),

  "f-minimal": () => (<>
    <rect width="1200" height="300" fill="url(#g-fm)" />
    <defs><linearGradient id="g-fm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e2e6f8" /></linearGradient></defs>
    <rect x="640" y="30" width="250" height="170" rx="14" fill="#fff" stroke="#d8dcf0" strokeWidth="4" /><path d="M765 30V200M640 115H890" stroke="#d8dcf0" strokeWidth="4" />
    <rect x="940" y="60" width="200" height="12" rx="4" fill="#cfd4ec" /><rect x="940" y="140" width="200" height="12" rx="4" fill="#cfd4ec" />
    {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={950 + i * 30} y={i % 2 ? 36 : 28} width="20" height={i % 2 ? 24 : 32} rx="3" fill={["#a99cf0", "#f2b8c6", "#9fd4c0", "#f3d49a", "#8fb6ef", "#c4a6ec"][i]} />)}
    <path d="M0 262 H1200 V300 H0Z" fill="#d6dcf2" /><rect x="520" y="226" width="440" height="14" rx="5" fill="#b9c0e4" />
    <g transform="translate(560 262)"><rect x="-24" y="-30" width="48" height="30" rx="6" fill="#fff" stroke="#cfd4ec" strokeWidth="3" /><path d="M0 -30 C-26 -80 -40 -56 -24 -96 M0 -30 C14 -90 38 -70 28 -104" stroke="#7fc69a" strokeWidth="8" fill="none" strokeLinecap="round" /></g>
  </>),

  "m-dark": () => (<>
    <defs><linearGradient id="g-md" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b1048" /><stop offset="0.6" stopColor="#3b1a86" /><stop offset="1" stopColor="#13092e" /></linearGradient></defs>
    <rect width="1200" height="300" fill="url(#g-md)" />
    <circle cx="960" cy="90" r="64" fill="#e9dcff" opacity="0.92" /><circle cx="960" cy="90" r="120" fill="#a98bff" opacity="0.22" />
    <Building x={0} w={90} h={150} c="#1a1038" /><Building x={96} w={70} h={210} c="#150c30" /><Building x={176} w={110} h={130} c="#1d1242" /><Building x={300} w={80} h={190} c="#150c30" />
    <Building x={700} w={90} h={170} c="#1a1038" /><Building x={800} w={120} h={220} c="#150c30" /><Building x={1000} w={100} h={180} c="#1d1242" /><Building x={1110} w={90} h={140} c="#150c30" />
    <path d="M0 292 H1200" stroke="#a98bff" strokeWidth="3" opacity="0.7" />
    {Array.from({ length: 30 }).map((_, i) => <circle key={i} cx={(i * 97) % 1200} cy={(i * 41) % 140} r={i % 4 ? 1.4 : 2.2} fill="#fff" opacity="0.7" />)}
  </>),

  "m-gym": () => (<>
    <defs><linearGradient id="g-mg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1a0f0b" /><stop offset="0.7" stopColor="#4a2110" /><stop offset="1" stopColor="#7a3412" /></linearGradient></defs>
    <rect width="1200" height="300" fill="url(#g-mg)" />
    <rect x="700" y="30" width="420" height="190" fill="#f59e0b" opacity="0.18" /><path d="M700 30 L560 300 M1120 30 L1260 300" stroke="#f59e0b" strokeWidth="2" opacity="0.2" />
    <path d="M600 230 H1160" stroke="#3b2418" strokeWidth="14" /><g fill="#2a1a12"><rect x="620" y="170" width="16" height="60" /><rect x="1124" y="170" width="16" height="60" /><circle cx="628" cy="170" r="34" /><circle cx="1132" cy="170" r="34" /></g>
    <path d="M0 262 H1200 V300 H0Z" fill="#241510" /><path d="M0 264 H1200" stroke="#f59e0b" strokeWidth="2" opacity="0.4" />
    <g opacity="0.5" stroke="#ff8a3d" strokeWidth="2">{Array.from({ length: 10 }).map((_, i) => <path key={i} d={`M${700 + i * 40} ${40 + (i % 3) * 20} l-30 8`} />)}</g>
  </>),

  "m-adventure": () => (<>
    <defs><linearGradient id="g-ma" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7cc4ff" /><stop offset="0.65" stopColor="#d5efff" /><stop offset="1" stopColor="#f6eab8" /></linearGradient></defs>
    <rect width="1200" height="300" fill="url(#g-ma)" />
    <g opacity="0.35" transform="translate(760 -20)">{Array.from({ length: 9 }).map((_, i) => <path key={i} d="M0 0 L260 300 L300 300Z" fill="#fff" transform={`rotate(${-40 + i * 10})`} />)}</g>
    <Cloud x={180} y={60} s={1.3} /><Cloud x={560} y={90} s={0.9} /><Cloud x={1050} y={50} s={1.1} />
    <path d="M0 250 C200 200 330 210 520 235 C700 255 900 205 1200 235 V300 H0Z" fill="#6cb356" /><path d="M0 285 C260 250 520 275 760 262 C960 252 1100 270 1200 262 V300 H0Z" fill="#4e9a45" />
    <path d="M520 300 C560 262 600 246 640 238 C700 232 720 246 760 262 L840 300Z" fill="#e6c88b" />
    {[40, 110, 230, 330, 960, 1050, 1130].map((x, i) => <g key={x} transform={`translate(${x} ${262 - (i % 2) * 8})`}><rect x="-6" y="-30" width="12" height="40" fill="#6a4a30" /><circle cx="0" cy="-52" r={34 - (i % 3) * 5} fill={["#3f8f3f", "#4ea24a", "#2f7a38"][i % 3]} /></g>)}
  </>),

  "m-minimal": () => (<>
    <defs><linearGradient id="g-mm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d6eadf" /></linearGradient></defs>
    <rect width="1200" height="300" fill="url(#g-mm)" />
    <path d="M520 300 L720 140 L820 210 L960 90 L1200 250 V300Z" fill="#b9d6c6" /><path d="M640 300 L860 190 L1000 250 L1200 170 V300Z" fill="#7fb69a" /><path d="M780 300 L1040 230 L1200 270 V300Z" fill="#3f8a68" />
    <g opacity="0.7"><ellipse cx="760" cy="200" rx="150" ry="14" fill="#fff" /><ellipse cx="1000" cy="170" rx="120" ry="10" fill="#fff" /></g>
    <circle cx="1100" cy="70" r="34" fill="#fff" opacity="0.8" />
  </>),
};

// `id` = the family (drawn fall-back); `photo` = the scene's picture. While the picture loads, or if it is missing, the drawing shows.
export default function Scene({ id, photo, onPhoto }) {
  const Art = SCENES[id];
  return (
    <>
      <svg className="sk-scene" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">{Art ? <Art /> : null}</svg>
      {photo && (
        <img className="sk-photo" src={`${import.meta.env.BASE_URL}skins/${photo}.webp?v=1`} alt="" decoding="async" fetchPriority="high"
          onLoad={(e) => { e.currentTarget.classList.add("is-in"); onPhoto?.(true); }}
          onError={(e) => { e.currentTarget.style.display = "none"; onPhoto?.(false); }} />
      )}
    </>
  );
}
