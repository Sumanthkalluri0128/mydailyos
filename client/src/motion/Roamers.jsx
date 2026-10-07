import { useEffect, useRef } from "react";
import "./roamers.css";
import { sprite, walkStrip } from "./chars";

// FlexFit Living Cast 3.0
// Design rule: a character is always ONE complete sprite. Combat extensions/effects are
// attached to locked anchor points calculated from that same root, so no body part can drift.
const WHO = ["zoro", "naruto", "luffy", "jinwoo", "goku", "gojo"];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const reduced = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const POWER = {
  zoro: { color: "#4ade80", name: "THREE SWORD SLASH", kind: "slash" },
  naruto: { color: "#38bdf8", name: "RASENGAN", kind: "rasengan" },
  luffy: { color: "#ef4444", name: "GEAR ATTACK", kind: "gear" },
  jinwoo: { color: "#a855f7", name: "SHADOW STRIKE", kind: "shadow" },
  goku: { color: "#f59e0b", name: "KAMEHAMEHA", kind: "beam" },
  gojo: { color: "#818cf8", name: "DOMAIN", kind: "domain" },
};

const RIG = {
  shoulder: { x: 0.18, y: 0.30 },
  hand: { x: 0.38, y: 0.38 },
  foot: { x: 0.16, y: 0.82 },
  head: { x: 0.50, y: 0.18 },
};
const anchor = (c, size, name) => ({ x: c.x + size * RIG[name].x, y: c.y + size * RIG[name].y });

const imageCache = new Map();
function getImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const im = new Image(); im.decoding = "async"; im.src = url; imageCache.set(url, im); return im;
}

function powerSpec(c) { return POWER[c.who] || POWER.goku; }

export default function Roamers() {
  const canvasRef = useRef(null);
  const charsRef = useRef([]);
  const fxRef = useRef([]);
  const nextSpawn = useRef(performance.now() + 900);
  const fightLock = useRef(false);
  const timers = useRef([]);

  useEffect(() => {
    if (reduced()) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: true });
    let alive = true, raf = 0, last = performance.now();
    const timersSet = timers.current;
    const size = () => window.innerWidth < 640 ? 82 : 108;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`; canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); window.addEventListener("resize", resize);

    const addFx = (f) => fxRef.current.push({ ...f, t: performance.now(), life: f.life || 850 });
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timersSet.add(id); return id; };

    const makeChar = (who, fromLeft) => {
      const s = size();
      return { id: `${who}-${Math.random()}`, who,
        x: fromLeft ? -s - 20 : window.innerWidth + 20, y: rand(95, Math.max(120, window.innerHeight - s - 40)),
        tx: rand(30, window.innerWidth - s - 30), ty: rand(95, window.innerHeight - s - 35),
        state: "walk", stateAt: performance.now(), stateUntil: performance.now() + rand(2800, 6500),
        speed: rand(35, 58), facing: fromLeft ? 1 : -1, phase: Math.random() * 6,
        energy: rand(.7, 1), activity: "walk", action: null, actionAt: 0, actionDur: 0, frame: 0, seed: Math.random() * 100,
      };
    };

    const setState = (c, state, duration = rand(1500, 4000), activity = state) => {
      c.state = state; c.stateAt = performance.now(); c.stateUntil = performance.now() + duration; c.activity = activity;
      c.actionAt = performance.now(); c.actionDur = duration;
    };

    const separate = (a, b, minDist) => {
      const ax = a.x + minDist * .5, ay = a.y + minDist * .5;
      const bx = b.x + minDist * .5, by = b.y + minDist * .5;
      let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
      if (!d) { dx = 1; dy = 0; d = 1; }
      if (d >= minDist) return;
      const push = (minDist - d) * .52;
      const nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    };

    const findElement = () => {
      const candidates = [];
      document.querySelectorAll("button,[role='button'],.card,.glass,.panel,section,article").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 130 && r.height > 50 && r.bottom > 60 && r.top < innerHeight - 40) candidates.push(r);
      });
      return candidates.length ? pick(candidates) : null;
    };

    const startActivity = (c) => {
      const now = performance.now(), s = size();
      if (c.energy < .16 && Math.random() < .7) {
        setState(c, "sleep", rand(4800, 8500), "sleep");
        c.tx = clamp(c.x, 10, innerWidth - s - 10); c.ty = innerHeight - s - 18; return;
      }
      const r = Math.random();
      if (r < .14) { // rope climb: bottom -> top
        c.state = "rope"; c.activity = "rope"; c.stateAt = now; c.stateUntil = now + rand(4200, 7000);
        c.ropeX = rand(45, innerWidth - 45); c.ropeTop = rand(70, Math.max(90, innerHeight * .28)); c.ropeBottom = innerHeight - s - 35; c.ropeDir = Math.random() < .5 ? 1 : -1;
        c.x = c.ropeX - s / 2; c.y = c.ropeDir > 0 ? c.ropeBottom : c.ropeTop; return;
      }
      if (r < .25) { // mountain climb
        c.state = "mountain"; c.activity = "mountain"; c.stateAt = now; c.stateUntil = now + rand(5000, 8000);
        c.mx = rand(45, innerWidth - 180); c.my = innerHeight - s - 30; c.mtop = rand(90, innerHeight * .48); c.mside = Math.random() < .5 ? 1 : -1; return;
      }
      if (r < .34) { // ledge / UI climb
        const el = findElement();
        if (el) { c.state = "ledge"; c.activity = "ledge"; c.stateAt = now; c.stateUntil = now + rand(3200, 6000); c.ledge = el; c.ledgeSide = Math.random() < .5 ? 1 : -1; return; }
      }
      if (r < .44) { setState(c, "jump", rand(1000, 1800), "jump"); c.tx = clamp(c.x + rand(-150,150), 15, innerWidth-s-15); c.ty = clamp(c.y + rand(-120,120), 80, innerHeight-s-25); return; }
      if (r < .53) { setState(c, "dance", rand(2500, 4500), "dance"); return; }
      if (r < .61) { setState(c, "meditate", rand(3000, 5200), "meditate"); return; }
      if (r < .68) { setState(c, "eat", rand(2300, 4200), "eat"); return; }
      c.tx = rand(20, Math.max(25, innerWidth-s-20)); c.ty = rand(80, Math.max(90, innerHeight-s-25));
      setState(c, "walk", rand(3800, 7600), "walk");
    };

    const fight = (a, b) => {
      if (fightLock.current || a.state === "sleep" || b.state === "sleep") return;
      fightLock.current = true;
      const s = size(), y = clamp((a.y+b.y)/2, 100, innerHeight-s-60), mid = clamp((a.x+b.x)/2, s*1.5, innerWidth-s*1.5);
      a.tx = mid - s * .78; a.ty = y; b.tx = mid + s * .78; b.ty = y; a.facing = 1; b.facing = -1;
      setState(a, "fightReady", 700, "fight"); setState(b, "fightReady", 700, "fight");
      const rounds = Math.floor(rand(6, 10));
      let i = 0;
      const sequence = () => {
        if (!alive || i >= rounds) {
          setState(a, "victory", 1100, "victory"); setState(b, "tired", 1800, "tired");
          a.energy = clamp(a.energy-.15,0,1); b.energy=clamp(b.energy-.22,0,1);
          later(() => { if (alive) { fightLock.current=false; setState(a,"walk",2200,"walk"); setState(b,"walk",2200,"walk"); a.tx=rand(20,innerWidth-s-20); b.tx=rand(20,innerWidth-s-20); } }, 1300);
          return;
        }
        const attacker = i % 2 === 0 ? a : b, defender = attacker === a ? b : a;
        attacker.facing = defender.x > attacker.x ? 1 : -1; defender.facing = -attacker.facing;
        const kind = powerSpec(attacker).kind;
        const attackStates = ["punch","kick","dash", "power"];
        const mode = i === rounds-1 ? "power" : pick(attackStates);
        attacker.state = mode; attacker.activity = mode; attacker.stateAt=performance.now(); attacker.stateUntil=performance.now()+620;
        defender.state = Math.random()<.55 ? "dodge" : "block"; defender.activity=defender.state;
        const hand = anchor(attacker,s,"hand"), head = anchor(defender,s,"head"), foot = anchor(attacker,s,"foot");
        const hitX = head.x + (defender.x>attacker.x ? -s*.10 : s*.10), hitY=head.y+s*.15;
        if (mode === "power") {
          addFx({kind:"power", x:hand.x, y:hand.y, tx:hitX, ty:hitY, color:powerSpec(attacker).color, label:powerSpec(attacker).name, power:kind, life:1150});
        } else if (mode === "kick") {
          addFx({kind:"kick", x:foot.x, y:foot.y, tx:hitX, ty:hitY, color:powerSpec(attacker).color, life:600});
        } else if (mode === "dash") {
          addFx({kind:"dash", x:attacker.x+s/2, y:attacker.y+s*.55, tx:hitX, ty:hitY, color:powerSpec(attacker).color, life:500});
        } else {
          addFx({kind:"punch", x:hand.x, y:hand.y, tx:hitX, ty:hitY, color:powerSpec(attacker).color, life:520});
        }
        if (Math.random()<.78) addFx({kind:"impact", x:hitX, y:hitY, color:powerSpec(attacker).color, text:pick(["POW!","WHAM!","BAM!","HYAH!"]), life:620});
        attacker.energy=clamp(attacker.energy-.025,0,1); defender.energy=clamp(defender.energy-.045,0,1);
        i++; later(sequence, 600 + rand(50,180));
      };
      later(sequence, 720);
    };

    const update = (c, dt, now) => {
      const s=size(); c.phase += dt * (c.state === "walk" || c.state === "rope" || c.state === "mountain" || c.state === "ledge" ? 7 : 2.2);
      c.energy=clamp(c.energy+dt*.012,0,1);
      if (now >= c.stateUntil && !["fightReady","punch","kick","dash","power","dodge","block","victory"].includes(c.state)) startActivity(c);
      if (["sleep","idle","eat","dance","meditate","tired","victory"].includes(c.state)) return;
      if (["fightReady","punch","kick","dash","power","dodge","block"].includes(c.state)) return;
      if (c.state === "rope") {
        const total=Math.max(1,c.stateUntil-c.stateAt), p=clamp((now-c.stateAt)/total,0,1); const q=c.ropeDir>0?p:1-p;
        c.y=c.ropeBottom+(c.ropeTop-c.ropeBottom)*q; c.x=c.ropeX-s/2; c.facing=c.ropeDir>0?1:-1; return;
      }
      if (c.state === "mountain") {
        const total=Math.max(1,c.stateUntil-c.stateAt), p=clamp((now-c.stateAt)/total,0,1);
        c.x=c.mx + Math.sin(p*Math.PI)*90*c.mside; c.y=c.my + (c.mtop-c.my)*p; c.facing=c.mside; return;
      }
      if (c.state === "ledge" && c.ledge) {
        const r=c.ledge, p=(now-c.stateAt)/(c.stateUntil-c.stateAt); c.x=clamp(r.left+(r.width||r.right-r.left)/2-s/2,8,innerWidth-s-8); c.y=clamp(r.top-s*.72+Math.sin(p*8)*4,70,innerHeight-s-10); c.facing=c.ledgeSide; return;
      }
      const dx=c.tx-c.x, dy=c.ty-c.y, d=Math.hypot(dx,dy);
      if (d>2) { const step=c.speed*dt; c.x+=dx/d*Math.min(step,d); c.y+=dy/d*Math.min(step,d); if(Math.abs(dx)>3)c.facing=dx>0?1:-1; }
      c.x=clamp(c.x,-s,innerWidth); c.y=clamp(c.y,65,innerHeight-s+8);
    };

    const drawEnvironment = (now) => {
      // Rope + mountain are intentionally subtle and only appear while someone uses them.
      for (const c of charsRef.current) {
        ctx.save(); ctx.lineWidth=3;
        if(c.state==='rope') { ctx.strokeStyle='rgba(148,163,184,.75)'; ctx.beginPath(); ctx.moveTo(c.ropeX,c.ropeTop); ctx.lineTo(c.ropeX,c.ropeBottom+size()); ctx.stroke(); for(let y=c.ropeTop;y<c.ropeBottom;y+=24){ctx.beginPath();ctx.moveTo(c.ropeX-4,y);ctx.lineTo(c.ropeX+4,y+6);ctx.stroke();} }
        if(c.state==='mountain') { const base=innerHeight-24, peakX=c.mx+90*c.mside, peakY=c.mtop+s*.45; ctx.fillStyle='rgba(100,116,139,.10)';ctx.beginPath();ctx.moveTo(c.mx-140,base);ctx.lineTo(peakX,peakY);ctx.lineTo(c.mx+180,base);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(100,116,139,.38)';ctx.beginPath();ctx.moveTo(c.mx-140,base);ctx.lineTo(peakX,peakY);ctx.lineTo(c.mx+180,base);ctx.stroke(); }
        ctx.restore();
      }
    };

    const drawFx=(now)=>{
      fxRef.current=fxRef.current.filter(f=>now-f.t<f.life);
      for(const f of fxRef.current){ const p=clamp((now-f.t)/f.life,0,1), q=1-p; ctx.save(); ctx.globalAlpha=q;
        if(f.kind==='impact'){ctx.fillStyle=f.color;ctx.strokeStyle=f.color;ctx.font='900 16px system-ui';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y-p*28);for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(f.x+Math.cos(a)*8,f.y+Math.sin(a)*8);ctx.lineTo(f.x+Math.cos(a)*(28+p*22),f.y+Math.sin(a)*(28+p*22));ctx.stroke();}}
        else if(['punch','kick','dash'].includes(f.kind)){const t=p; const x=f.x+(f.tx-f.x)*t,y=f.y+(f.ty-f.y)*t;ctx.strokeStyle=f.color;ctx.lineWidth=f.kind==='kick'?10:7;ctx.globalAlpha=.8*q;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x,y);ctx.stroke();ctx.beginPath();ctx.arc(x,y,10+12*t,0,Math.PI*2);ctx.stroke();}
        else if(f.kind==='power'){ const t=clamp(p*1.18,0,1),x=f.x+(f.tx-f.x)*t,y=f.y+(f.ty-f.y)*t;ctx.strokeStyle=f.color;ctx.fillStyle=f.color;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x,y);ctx.stroke();
          if(f.power==='rasengan'||f.power==='shadow'||f.power==='gear'){ctx.shadowColor=f.color;ctx.shadowBlur=18;ctx.beginPath();ctx.arc(x,y,16+10*Math.sin(now/70),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fff';ctx.lineWidth=2;for(let k=0;k<3;k++){ctx.beginPath();ctx.arc(x,y,9+k*5,now/130+k,now/130+k+2.3);ctx.stroke();}}
          else if(f.power==='beam'){ctx.lineWidth=18;ctx.globalAlpha=.32*q;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x,y);ctx.stroke();ctx.lineWidth=5;ctx.globalAlpha=.9*q;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x,y);ctx.stroke();ctx.beginPath();ctx.arc(x,y,14+6*Math.sin(now/55),0,Math.PI*2);ctx.fill();}
          else {ctx.strokeStyle=f.color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(x,y,30+70*p,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,55+90*p,Math.PI*.2,Math.PI*1.7);ctx.stroke();}
          ctx.font='900 10px system-ui';ctx.textAlign='center';ctx.fillText(f.label,f.tx,f.ty+32);
        }
        ctx.restore(); }
    };

    const drawChar=(c,now)=>{
      const s=size(), im=getImage((c.state==='walk'||c.state==='jump'||c.state==='rope'||c.state==='mountain'||c.state==='ledge')?walkStrip(c.who):sprite(c.who,c.state==='sleep'?'sleep':c.state==='fightReady'||c.state==='punch'||c.state==='kick'||c.state==='dash'||c.state==='power'||c.state==='dodge'||c.state==='block'?'fight':c.state==='dance'?'dance':c.state==='eat'?'eat':c.state==='meditate'?'habit':c.state==='victory'?'cheer':'walk'));
      ctx.save();ctx.translate(c.x+s/2,c.y+s/2);ctx.scale(c.facing,1);
      const bob=(c.state==='walk'||c.state==='rope'||c.state==='mountain')?Math.sin(c.phase)*3:Math.sin(c.phase*.5)*1.2;
      ctx.translate(0,bob);
      if(c.state==='punch'||c.state==='power') {const p=clamp((now-c.stateAt)/c.stateUntil,0,1);ctx.translate(9*Math.sin(p*Math.PI),0);ctx.rotate(.035*Math.sin(p*Math.PI));}
      if(c.state==='kick')ctx.rotate(.06*Math.sin((now-c.stateAt)/c.stateUntil*Math.PI));
      if(c.state==='dodge')ctx.rotate(-.16);
      if(c.state==='sleep')ctx.rotate(.025*Math.sin(now/800));
      ctx.shadowColor=powerSpec(c).color;ctx.shadowBlur=['power','victory'].includes(c.state)?18:5;
      if(im&&im.complete&&im.naturalWidth){
        if((c.state==='walk'||c.state==='jump'||c.state==='rope'||c.state==='mountain'||c.state==='ledge')&&im.naturalWidth>=im.naturalHeight*2){const frames=8,fw=im.naturalWidth/frames,frame=Math.floor(c.phase*1.35)%frames;ctx.drawImage(im,frame*fw,0,fw,im.naturalHeight,-s/2,-s/2,s,s);}else ctx.drawImage(im,-s/2,-s/2,s,s);
      }
      ctx.restore();
    };

    const spawn=()=>{if(charsRef.current.length>=2)return;const n=Math.min(2-charsRef.current.length,Math.random()<.65?2:1),used=new Set(charsRef.current.map(c=>c.who));for(let i=0;i<n;i++){const pool=WHO.filter(w=>!used.has(w)),c=makeChar(pick(pool.length?pool:WHO),Math.random()<.5);used.add(c.who);charsRef.current.push(c);}};

    const tick=(now)=>{if(!alive)return;const dt=Math.min(.04,(now-last)/1000);last=now;if(now>=nextSpawn.current&&charsRef.current.length<2){spawn();nextSpawn.current=now+rand(9000,15000);}for(const c of charsRef.current)update(c,dt,now);
      if(charsRef.current.length===2&&!fightLock.current){const [a,b]=charsRef.current;separate(a,b,size()*1.32);const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<size()*2.3&&d>size()*1.05&&Math.random()<dt*.22)fight(a,b);}
      ctx.clearRect(0,0,innerWidth,innerHeight);drawEnvironment(now);drawFx(now);for(const c of charsRef.current)drawChar(c,now);raf=requestAnimationFrame(tick);};
    spawn();raf=requestAnimationFrame(tick);
    return()=>{alive=false;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);timersSet.forEach(clearTimeout);charsRef.current=[];fxRef.current=[];};
  },[]);

  return <canvas ref={canvasRef} className="rm-canvas" aria-hidden="true" />;
}
