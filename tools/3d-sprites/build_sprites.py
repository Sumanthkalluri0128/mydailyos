"""Build 3D sprite files from extracted poses.
usage: build_sprites.py poses_dir out_dir who
 - stills:  <who>-<pose>.webp (320x320, feet on a common ground line, one uniform scale for every pose)
 - strips:  <who>-walkstrip / runstrip / climbstrip .webp  (16 square frames of 380px side by side)
"""
import sys, os, math
from PIL import Image
PD, OUT, WHO = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)
NAMES = ['stand','thumbsup','crossed','stance','flypunch','flykick','kame','ssj','nimbus','run','crouch','jump','joy','ramen','drink','sleep',
         'barbell','pushup','pullup','lying','punch','bag','kick','sprint','wallclimb','hike','meditate','read','staff','sprint2','dash','cheer']
C, S, PAD, F, FO = 320, 0.9, 12, 380, 256
poses = [Image.open(f'{PD}/{i:02d}.png').convert('RGBA') for i in range(32)]

def scaled(im): return im.resize((max(1, round(im.width * S)), max(1, round(im.height * S))), Image.LANCZOS)
def place(im, canvas=C, dx=0, dy=0):
    c = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    c.alpha_composite(im, ((canvas - im.width) // 2 + dx, canvas - PAD - im.height + dy)) if True else None
    return c
def save(im, name, q=88): im.save(f'{OUT}/{WHO}-{name}.webp', 'WEBP', quality=q, method=6)

SP = [scaled(p) for p in poses]
KEEP = {'stand','thumbsup','crossed','stance','flypunch','kame','ssj','nimbus','crouch','jump','joy','ramen','drink','sleep','barbell','pushup','punch','kick','sprint','meditate','read','dash','cheer'}
for i, n in enumerate(NAMES):
    if n in KEEP: save(place(SP[i]), n)

# ---------- strips ----------
def xform(im, rot=0, sx=1, sy=1, dx=0, dy=0, pivot=(0.5, 1.0)):
    """rotate/scale about a pivot (fraction of image) and drop onto an F-size frame, feet on the ground line."""
    w, h = im.size
    big = Image.new('RGBA', (w * 2, h * 2), (0, 0, 0, 0)); big.alpha_composite(im, (w // 2, h // 2))
    px, py = w // 2 + pivot[0] * w, h // 2 + pivot[1] * h
    big = big.resize((round(big.width * sx), round(big.height * sy)), Image.BICUBIC)
    px, py = px * sx, py * sy
    big = big.rotate(rot, resample=Image.BICUBIC, center=(px, py))
    fr = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    fr.alpha_composite(big, (round(F / 2 - px + dx), round(F - PAD * (F / C) - py + dy))) if True else None
    return fr
def strip(frames, name):
    s = Image.new('RGBA', (FO * 16, FO), (0, 0, 0, 0))
    for i, f in enumerate(frames): s.alpha_composite(f.resize((FO, FO), Image.LANCZOS), (i * FO, 0))
    save(s, name, 82)

# walk: front-facing stride. Torso bobs and leans; legs take turns lifting (leg shortens from the hip) so it reads as stepping.
base = SP[0]; w, h = base.size
hip = round(h * 0.70); OV = 16
torso = base.crop((0, 0, w, hip + 4)); legs = base.crop((0, hip - OV, w, h))
lw = legs.width // 2
legL, legR = legs.crop((0, 0, lw, legs.height)), legs.crop((lw, 0, w, legs.height))
def walk_frame(t):
    ph = 2 * math.pi * t
    lifts = (max(0, math.sin(ph)), max(0, -math.sin(ph)))
    img = Image.new('RGBA', (w + 20, h + 40), (0, 0, 0, 0)); gy = h + 30; top = gy - legs.height
    for leg, x0, lift in ((legL, 0, lifts[0]), (legR, lw, lifts[1])):
        sh = round(leg.height * (1 - 0.14 * lift)); l2 = leg.resize((leg.width, leg.height), Image.BICUBIC).transform(leg.size, Image.AFFINE, (1, 0, 0, 0, 1 / (1 - 0.14 * lift) if lift else 1, 0), Image.BICUBIC) if lift else leg
        img.alpha_composite(l2, (10 + x0, top))
    tor = torso.rotate(math.sin(ph) * 3, resample=Image.BICUBIC, center=(w // 2, torso.height))
    img.alpha_composite(tor, (10, top + OV - torso.height))
    bob = round(abs(math.sin(ph)) * 6); out = Image.new('RGBA', img.size, (0, 0, 0, 0)); out.alpha_composite(img, (0, -bob))
    bb = out.getbbox(); return out.crop((0, bb[1], out.width, gy))
wf = []
for k in range(16):
    im = walk_frame(k / 16); fr = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    fr.alpha_composite(im, ((F - im.width) // 2, F - round(PAD * F / C) - im.height)); wf.append(fr)
strip(wf, 'walkstrip')

# run: leaning sprint pose, bigger bounce, stretch on push-off, squash on landing
rb = SP[9]
rf = [xform(rb, rot=-3 + 3 * math.sin(2 * math.pi * k / 16), sx=1 - 0.04 * abs(math.sin(2 * math.pi * k / 8)), sy=1 + 0.05 * abs(math.sin(2 * math.pi * k / 8)),
            dy=-round(14 * abs(math.sin(2 * math.pi * k / 8)))) for k in range(16)]
strip(rf, 'runstrip')

# climb: hand-over-hand. Reach pose and its mirror alternate; the body rises on each reach.
cb = SP[31]; cm = cb.transpose(Image.FLIP_LEFT_RIGHT)
cf = []
for k in range(16):
    a = (k // 4) % 2; im = cm if a else cb
    cf.append(xform(im, rot=math.sin(2 * math.pi * k / 8) * 3, dy=-round(8 * abs(math.sin(math.pi * k / 4)))))
strip(cf, 'climbstrip')
print('done', len(os.listdir(OUT)))
