#!/usr/bin/env python3
"""Cuts every figure of the 10x10 3D chibi sheet out as a transparent webp (client/public/chars/fig/<who>-<pose>.webp).
Needs: pip install rembg onnxruntime scipy.  Usage: python3 cutout_figures.py <sheet.png> <out_dir>"""
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi
from rembg import new_session, remove
WHO = ["goku","naruto","luffy","jinwoo","zoro","gojo","kakashi","tanjiro","zenitsu","inosuke"]
POSE = ["say","dance","eat","drink","workout","walk","sit","study","phone","sleep"]
X = [0,204,369,525,680,838,990,1131,1265,1398,1536]
Y = [45,174,282,392,502,593,683,768,857,932,1024]
PAD, S = 12, 2
# Dark-on-dark scenes (black outfit on a dark prop) cannot be matted cleanly: these are kept as rounded tiles instead.
TILES = set(filter(None, os.environ.get("TILES", "").split(",")))
sheet = Image.open(sys.argv[1]).convert("RGB"); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
sess = new_session(os.environ.get("MODEL", "u2net"))
for r, who in enumerate(WHO):
    for c, pose in enumerate(POSE):
        x0, y0, x1, y1 = max(0, X[c]-PAD), max(0, Y[r]-PAD), min(1536, X[c+1]+PAD), min(1024, Y[r+1]+PAD)
        if os.environ.get("ONLY") and f"{who}-{pose}" not in os.environ["ONLY"].split(","): continue
        if f"{who}-{pose}" in TILES:
            t = sheet.crop((X[c]+3, Y[r]+3, X[c+1]-3, Y[r+1]-3)); t = t.resize((t.width*S, t.height*S), Image.LANCZOS)
            m = Image.new("L", t.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, t.width-1, t.height-1), 26, fill=255)
            t.putalpha(m.filter(ImageFilter.GaussianBlur(1.2))); t.save(os.path.join(out, f"{who}-{pose}.webp"), quality=88); continue
        win = sheet.crop((x0, y0, x1, y1)); win = win.resize((win.width*S, win.height*S), Image.LANCZOS)
        rgba = remove(win, session=sess)
        a = np.array(rgba)[..., 3]
        lab, n = ndi.label(a > 40)
        if n:
            sizes = ndi.sum(a > 40, lab, range(1, n+1)); big = sizes.max()
            cx0, cy0, cx1, cy1 = (X[c]-x0)*S, (Y[r]-y0)*S, (X[c+1]-x0)*S, (Y[r+1]-y0)*S
            keep = np.zeros_like(a, bool)
            band = np.zeros_like(a, bool); band[max(0, cy0-10):cy1+10, :] = True  # drop neighbours' heads / feet from rows above and below
            a = np.where(band, a, 0); lab, n = ndi.label(a > 40); sizes = ndi.sum(a > 40, lab, range(1, n+1)); big = sizes.max() if n else 1
            for i in range(1, n+1):
                ys, xs = np.nonzero(lab == i)
                if sizes[i-1] >= big*0.06 and cx0-6 <= xs.mean() <= cx1+6 and cy0-6 <= ys.mean() <= cy1+6:
                    keep |= lab == i
            arr = np.array(rgba); arr[..., 3] = np.where(keep, a, 0); rgba = Image.fromarray(arr)
        bb = rgba.getbbox()
        if bb: rgba = rgba.crop((max(0, bb[0]-4), max(0, bb[1]-4), min(rgba.width, bb[2]+4), min(rgba.height, bb[3]+4)))
        rgba.save(os.path.join(out, f"{who}-{pose}.webp"), quality=90)
    print(who, flush=True)
