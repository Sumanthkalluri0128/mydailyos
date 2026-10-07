import { useEffect, useRef } from "react";
import "./roamers.css";
import { sprite, walkStrip } from "./chars";

// FlexFit Living Cast 4.0
// IMPORTANT: each hero is rendered as one complete sprite. Activities animate the
// whole rooted character; no arm/leg/head is ever detached or independently positioned.
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

const imageCache = new Map();
function getImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const im = new Image();
  im.decoding = "async";
  im.src = url;
  imageCache.set(url, im);
  return im;
}

function activityScene(c) {
  // Do NOT randomly swap images while an activity is running.
  if (["walk", "rope", "mountain", "ledge", "jump"].includes(c.state)) return "walk";
  if (["fightReady", "punch", "kick", "power", "dash", "dodge", "block"].includes(c.state)) return "fight";
  if (c.state === "sleep" || c.state === "tired") return "sleep";
  if (c.state === "dance") return "dance";
  if (c.state === "eat") return "eat";
  if (c.state === "meditate") return "habit";
  if (c.state === "victory") return "cheer";
  if (c.state === "scale") return "scale";
  return "walk";
}

export default function Roamers() {
  const canvasRef = useRef(null);
  const charsRef = useRef([]);
  const fxRef = useRef([]);
  const fightLock = useRef(false);
  const timers = useRef(new Set());

  useEffect(() => {
    if (reduced()) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: true });
    let alive = true;
    let raf = 0;
    let last = performance.now();
    const size = () => window.innerWidth < 640 ? 84 : 108;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(innerWidth * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener("resize", resize);

    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
      timers.current.add(id);
      return id;
    };
    const fx = (f) => fxRef.current.push({ ...f, t: performance.now(), life: f.life || 700 });

    const makeChar = (who, side) => {
      const s = size();
      const y = rand(100, Math.max(120, innerHeight - s - 60));
      return {
        id: `${who}-${Math.random()}`, who, x: side < 0 ? -s : innerWidth + s, y,
        tx: rand(30, innerWidth - s - 30), ty: y,
        state: "walk", stateAt: performance.now(), stateUntil: performance.now() + rand(7000, 11000),
        speed: rand(22, 34), facing: side < 0 ? 1 : -1, phase: Math.random() * 10,
        walkClock: Math.random() * 1.5, energy: 1, visible: true, activitySeed: Math.random(),
        frame: 0, rope: null, mountain: null, ledge: null,
        combat: null,
      };
    };

    const setState = (c, state, duration) => {
      const now = performance.now();
      c.state = state; c.stateAt = now; c.stateUntil = now + duration;
      c.walkClock = 0;
    };

    const chooseActivity = (c) => {
      const s = size();
      if (c.energy < .18) {
        c.tx = clamp(c.x, 10, innerWidth - s - 10); c.ty = innerHeight - s - 24;
        setState(c, "sleep", rand(6500, 10000));
        return;
      }
      const r = Math.random();
      if (r < .16) {
        c.rope = { x: rand(45, innerWidth - 45), top: rand(90, Math.max(120, innerHeight * .28)), bottom: innerHeight - s - 28 };
        c.x = c.rope.x - s / 2; c.y = c.rope.bottom;
        c.rope.fromBottom = true;
        c.rope.dir = -1;
        setState(c, "rope", rand(8500, 11500));
        return;
      }
      if (r < .28) {
        const left = rand(30, Math.max(35, innerWidth - 240));
        c.mountain = { left, base: innerHeight - s - 28, peakX: left + rand(90, 190), peakY: rand(110, Math.max(150, innerHeight * .48)) };
        setState(c, "mountain", rand(9000, 12500));
        return;
      }
      if (r < .36) { setState(c, "dance", rand(4200, 6500)); return; }
      if (r < .43) { setState(c, "eat", rand(3500, 5200)); return; }
      if (r < .50) { setState(c, "meditate", rand(4200, 6500)); return; }
      if (r < .57) { setState(c, "jump", rand(1800, 2400)); c.tx = clamp(c.x + rand(-160, 160), 15, innerWidth-s-15); c.ty = clamp(c.y - rand(50, 120), 80, innerHeight-s-25); return; }
      c.tx = rand(25, Math.max(30, innerWidth - s - 25));
      c.ty = rand(90, Math.max(100, innerHeight - s - 45));
      setState(c, "walk", rand(7500, 12000));
    };

    const separate = (a, b, minDist) => {
      const ax = a.x + size()/2, ay = a.y + size()/2, bx = b.x + size()/2, by = b.y + size()/2;
      let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
      if (!d) { dx = 1; dy = 0; d = 1; }
      if (d >= minDist) return;
      const push = (minDist - d) * 0.52, nx = dx/d, ny = dy/d;
      a.x -= nx*push; a.y -= ny*push; b.x += nx*push; b.y += ny*push;
    };

    const startFight = (a, b) => {
      if (fightLock.current || a.state === "sleep" || b.state === "sleep") return;
      fightLock.current = true;
      const s = size();
      const y = clamp((a.y+b.y)/2, 100, innerHeight-s-40);
      const mid = clamp((a.x+b.x)/2, s*1.4, innerWidth-s*1.4);
      a.x = mid-s*0.92; b.x = mid+s*0.02; a.y = b.y = y;
      a.facing = 1; b.facing = -1;
      a.combat = { role: "a", phase: 0, total: 7 };
      b.combat = { role: "b", phase: 0, total: 7 };
      setState(a, "fightReady", 900); setState(b, "fightReady", 900);

      const phases = ["punch","dodge","kick","block","punch","dodge","power"];
      let i = 0;
      const next = () => {
        if (!alive) return;
        if (i >= phases.length) {
          setState(a, "victory", 1800); setState(b, "tired", 2600);
          a.energy = clamp(a.energy-.18,0,1); b.energy = clamp(b.energy-.28,0,1);
          later(() => { fightLock.current=false; a.combat=b.combat=null; chooseActivity(a); chooseActivity(b); }, 2200);
          return;
        }
        const attacker = i%2===0 ? a : b;
        const defender = attacker===a ? b : a;
        const mode = phases[i];
        attacker.facing = defender.x > attacker.x ? 1 : -1;
        defender.facing = -attacker.facing;
        setState(attacker, mode, mode === "power" ? 1450 : 850);
        setState(defender, i%3===0 ? "dodge" : "block", 850);
        attacker.combat.phase = i; defender.combat.phase = i;
        const sx = attacker.x + s*(attacker.facing>0 ? .78 : .22);
        const sy = attacker.y + s*.38;
        const tx = defender.x + s*(attacker.facing>0 ? .22 : .78);
        const ty = defender.y + s*.32;
        if (mode === "power") {
          const p = POWER[attacker.who];
          fx({kind:"power",x:sx,y:sy,tx,ty,color:p.color,label:p.name,power:p.kind,life:1250});
        } else if (mode === "kick") fx({kind:"arc",x:sx,y:sy+18,tx,ty,color:POWER[attacker.who].color,life:620});
        else fx({kind:"strike",x:sx,y:sy,tx,ty,color:POWER[attacker.who].color,life:540});
        if (i%2===1 || mode==="power") fx({kind:"impact",x:tx,y:ty,color:POWER[attacker.who].color,text:pick(["POW!","BAM!","WHAM!"]),life:650});
        attacker.energy=clamp(attacker.energy-.035,0,1); defender.energy=clamp(defender.energy-.045,0,1);
        i++; later(next, mode === "power" ? 1500 : 920);
      };
      later(next, 950);
    };

    const update = (c, dt, now) => {
      const s = size();
      c.energy = clamp(c.energy + dt*.008, 0, 1);
      c.phase += dt * (["walk","mountain","rope"].includes(c.state) ? 4.0 : 1.8);
      if (now >= c.stateUntil && !fightLock.current) chooseActivity(c);

      if (["sleep","eat","dance","meditate","victory","tired","fightReady","punch","kick","power","dodge","block"].includes(c.state)) return;

      if (c.state === "rope" && c.rope) {
        const p = clamp((now-c.stateAt)/(c.stateUntil-c.stateAt),0,1);
        c.y = c.rope.bottom + (c.rope.top-c.rope.bottom)*p;
        c.x = c.rope.x-s/2;
        c.facing = -1;
        c.energy = clamp(c.energy-.0015*dt*60,0,1);
        return;
      }
      if (c.state === "mountain" && c.mountain) {
        const p = clamp((now-c.stateAt)/(c.stateUntil-c.stateAt),0,1);
        const ease = p*p*(3-2*p);
        c.x = c.mountain.left + (c.mountain.peakX-c.mountain.left)*ease;
        c.y = c.mountain.base + (c.mountain.peakY-c.mountain.base)*ease;
        c.facing = c.mountain.peakX >= c.mountain.left ? 1 : -1;
        return;
      }

      const dx=c.tx-c.x, dy=c.ty-c.y, d=Math.hypot(dx,dy);
      if(d>2){ const step=c.speed*dt; c.x += dx/d*Math.min(step,d); c.y += dy/d*Math.min(step,d); if(Math.abs(dx)>2)c.facing=dx>0?1:-1; }
      c.x=clamp(c.x,-s,innerWidth); c.y=clamp(c.y,70,innerHeight-s+6);
      if(["walk","jump","rope","mountain"].includes(c.state)) c.walkClock += dt;
      if(c.walkClock>.14){c.walkClock=0;c.frame=(c.frame+1)%8;}
    };

    const drawEnvironment = () => {
      const s=size();
      for(const c of charsRef.current){
        ctx.save();
        if(c.state==="rope"&&c.rope){ctx.strokeStyle="rgba(100,116,139,.55)";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(c.rope.x,c.rope.top);ctx.lineTo(c.rope.x,c.rope.bottom+s);ctx.stroke();ctx.lineWidth=2;for(let y=c.rope.top;y<c.rope.bottom;y+=28){ctx.beginPath();ctx.moveTo(c.rope.x-7,y);ctx.lineTo(c.rope.x+7,y+7);ctx.stroke();}}
        if(c.state==="mountain"&&c.mountain){const m=c.mountain;ctx.fillStyle="rgba(71,85,105,.09)";ctx.strokeStyle="rgba(71,85,105,.30)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(m.left-110,m.base+s);ctx.lineTo(m.peakX,m.peakY);ctx.lineTo(m.left+260,m.base+s);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(m.left+45,m.base);ctx.lineTo(m.peakX-15,m.peakY+55);ctx.lineTo(m.peakX+60,m.peakY+20);ctx.stroke();}
        ctx.restore();
      }
    };

    const drawFx = now => {
      fxRef.current=fxRef.current.filter(f=>now-f.t<f.life);
      for(const f of fxRef.current){const p=clamp((now-f.t)/f.life,0,1),q=1-p;ctx.save();ctx.globalAlpha=q;
        if(f.kind==="impact"){ctx.fillStyle=f.color;ctx.font="900 16px system-ui";ctx.textAlign="center";ctx.fillText(f.text,f.x,f.y-24*p);ctx.strokeStyle=f.color;ctx.lineWidth=3;for(let k=0;k<8;k++){const a=k*Math.PI/4;ctx.beginPath();ctx.moveTo(f.x+Math.cos(a)*8,f.y+Math.sin(a)*8);ctx.lineTo(f.x+Math.cos(a)*(25+20*p),f.y+Math.sin(a)*(25+20*p));ctx.stroke();}}
        else if(f.kind==="strike"||f.kind==="arc"){const t=Math.min(1,p*1.35),x=f.x+(f.tx-f.x)*t,y=f.y+(f.ty-f.y)*t;ctx.strokeStyle=f.color;ctx.lineWidth=f.kind==="arc"?9:6;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x,y);ctx.stroke();ctx.beginPath();ctx.arc(x,y,7+14*t,0,Math.PI*2);ctx.stroke();}
        else if(f.kind==="power"){const t=clamp(p*1.12,0,1),x=f.x+(f.tx-f.x)*t,y=f.y+(f.ty-f.y)*t;ctx.strokeStyle=f.color;ctx.fillStyle=f.color;ctx.lineCap="round";ctx.lineWidth=f.power==="beam"?15:7;ctx.globalAlpha=.25*q;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x,y);ctx.stroke();ctx.globalAlpha=.9*q;ctx.lineWidth=f.power==="beam"?5:7;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x,y);ctx.stroke();ctx.shadowColor=f.color;ctx.shadowBlur=18;ctx.beginPath();ctx.arc(x,y,f.power==="rasengan"?16+7*Math.sin(now/55):13+7*Math.sin(now/65),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.font="900 10px system-ui";ctx.textAlign="center";ctx.fillText(f.label,f.tx,f.ty+30);if(f.power==="slash"){ctx.strokeStyle=f.color;ctx.lineWidth=5;for(let k=-1;k<=1;k++){ctx.beginPath();ctx.moveTo(x-30,y+18*k);ctx.lineTo(x+24,y-24+18*k);ctx.stroke();}}}
        ctx.restore();}
    };

    const drawChar=(c,now)=>{
      const s=size(), scene=activityScene(c), isWalk=["walk","rope","mountain","ledge","jump"].includes(c.state);
      const url=isWalk?walkStrip(c.who):sprite(c.who,scene); const im=getImage(url);
      ctx.save();ctx.translate(c.x+s/2,c.y+s/2);ctx.scale(c.facing,1);
      let bob=0,scale=1,rot=0;
      if(c.state==="walk"||c.state==="mountain") bob=Math.sin(c.phase)*1.5;
      if(c.state==="rope") {bob=Math.sin(c.phase*.7)*1.2;rot=.025*Math.sin(c.phase);}
      if(c.state==="sleep"){bob=Math.sin(now/900)*.7;rot=.025*Math.sin(now/900);scale=.98+.015*Math.sin(now/900);}
      if(c.state==="dance"){bob=Math.sin(now/180)*3;rot=.08*Math.sin(now/230);scale=1+.025*Math.sin(now/180);}
      if(c.state==="jump"){const p=clamp((now-c.stateAt)/(c.stateUntil-c.stateAt),0,1);bob=-Math.sin(p*Math.PI)*14;scale=1+.02*Math.sin(p*Math.PI);}
      if(["punch","kick","power"].includes(c.state)){const p=clamp((now-c.stateAt)/(c.stateUntil-c.stateAt),0,1),strike=Math.sin(p*Math.PI);bob=-strike*2;ctx.translate(strike*(c.state==="power"?12:7),0);rot=(c.state==="kick"?.08:.035)*Math.sin(p*Math.PI);scale=1+.025*strike;}
      if(c.state==="dodge"){ctx.translate(-4,0);rot=-.14;scale=.98;}
      ctx.translate(0,bob);ctx.rotate(rot);ctx.scale(scale,scale);
      ctx.shadowColor=POWER[c.who].color;ctx.shadowBlur=["power","victory"].includes(c.state)?16:0;
      if(im&&im.complete&&im.naturalWidth){if(isWalk&&im.naturalWidth>=im.naturalHeight*4){const fw=im.naturalWidth/8;ctx.drawImage(im,c.frame*fw,0,fw,im.naturalHeight,-s/2,-s/2,s,s);}else ctx.drawImage(im,-s/2,-s/2,s,s);}
      ctx.restore();
    };

    const spawn=()=>{if(charsRef.current.length>=2)return;const used=new Set(charsRef.current.map(c=>c.who));const pool=WHO.filter(w=>!used.has(w));const n=Math.min(2-charsRef.current.length,Math.random()<.55?2:1);for(let i=0;i<n;i++)charsRef.current.push(makeChar(pool[i%pool.length],i===0?-1:1));};

    const tick=now=>{if(!alive)return;const dt=Math.min(.033,(now-last)/1000);last=now;spawn();for(const c of charsRef.current)update(c,dt,now);
      if(charsRef.current.length===2&&!fightLock.current){const [a,b]=charsRef.current;separate(a,b,size()*1.45);const d=Math.hypot((a.x-b.x),(a.y-b.y));if(d<size()*2.15&&d>size()*1.38&&a.state==="walk"&&b.state==="walk"){a.tx=b.x;b.tx=a.x;if(Math.random()<dt*.12)startFight(a,b);}}
      ctx.clearRect(0,0,innerWidth,innerHeight);drawEnvironment();drawFx(now);for(const c of charsRef.current)drawChar(c,now);raf=requestAnimationFrame(tick);};
    spawn();raf=requestAnimationFrame(tick);
    return()=>{alive=false;cancelAnimationFrame(raf);removeEventListener("resize",resize);timers.current.forEach(clearTimeout);timers.current.clear();charsRef.current=[];fxRef.current=[];};
  },[]);

  return <canvas ref={canvasRef} className="rm-canvas" aria-hidden="true"/>;
}
