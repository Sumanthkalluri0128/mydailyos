"""Cut the 32 poses out of the transparent 3D Goku sheet -> poses/NN.png (full-res RGBA, tight crop)."""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = sys.argv[1]; OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC).convert('RGBA'); RGBA = np.array(im); A = RGBA[:, :, 3]
m = A > 40
lab, n = ndi.label(m)
sizes = ndi.sum(m, lab, range(1, n + 1)); objs = ndi.find_objects(lab)

big = [i + 1 for i in range(n) if sizes[i] >= 2500]
small = [i + 1 for i in range(n) if 40 <= sizes[i] < 2500]
rows = {0: [], 1: [], 2: [], 3: []}
for l in big:
    s = objs[l - 1]; cy = (s[0].start + s[0].stop) / 2
    r = 0 if cy < 335 else 1 if cy < 560 else 2 if cy < 780 else 3
    rows[r].append(l)
for r in rows: rows[r].sort(key=lambda l: objs[l - 1][1].start)

# poses = list of boolean masks
masks = []
for r in range(4):
    for l in rows[r]:
        pm = lab == l
        if r == 2 and (objs[l - 1][1].stop - objs[l - 1][1].start) > 300:   # pull-up bar + lying pose fused: split at the gap
            cut = 577; left = pm.copy(); left[:, cut:] = False; right = pm.copy(); right[:, :cut] = False
            masks += [left, right]
        else:
            masks.append(pm)
assert len(masks) == 32, len(masks)

# attach stray fragments (detached tail, debris, sparkles) to the nearest pose bbox if within 45px
def bbox(mk):
    ys, xs = np.where(mk); return xs.min(), ys.min(), xs.max(), ys.max()
BB = [bbox(mk) for mk in masks]
def dist(b, c):
    dx = max(b[0] - c[2], c[0] - b[2], 0); dy = max(b[1] - c[3], c[1] - b[3], 0); return (dx * dx + dy * dy) ** .5
for l in small:
    s = objs[l - 1]; c = (s[1].start, s[0].start, s[1].stop - 1, s[0].stop - 1)
    d = [dist(b, c) for b in BB]; k = int(np.argmin(d))
    if d[k] <= 45: masks[k] |= (lab == l)

for k, pm in enumerate(masks):
    region = ndi.binary_dilation(pm, iterations=3)          # keep the soft anti-aliased edge
    out = RGBA.copy(); out[~region] = 0
    x0, y0, x1, y1 = bbox(region)
    Image.fromarray(out).crop((x0, y0, x1 + 1, y1 + 1)).save(f'{OUT}/{k:02d}.png')
    print(k, (x1 - x0 + 1, y1 - y0 + 1))
