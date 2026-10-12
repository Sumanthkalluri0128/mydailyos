#!/usr/bin/env python3
"""Slices the 10x10 3D chibi sheet into client/public/chars/fig/<who>-<pose>.webp
(rounded dark tiles, 2x upscaled). Usage: python3 slice_figures.py <sheet.png> <out_dir>"""
import sys, os
from PIL import Image, ImageDraw, ImageFilter
WHO = ["goku","naruto","luffy","jinwoo","zoro","gojo","kakashi","tanjiro","zenitsu","inosuke"]
POSE = ["say","dance","eat","drink","workout","walk","sit","study","phone","sleep"]
X = [0,204,369,525,680,838,990,1131,1265,1398,1536]
Y = [45,174,282,392,502,593,683,768,857,932,1024]
INSET, SCALE, RADIUS = 4, 2, 26
sheet = Image.open(sys.argv[1]).convert("RGB"); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
for r, who in enumerate(WHO):
    for c, pose in enumerate(POSE):
        tile = sheet.crop((X[c]+INSET, Y[r]+INSET, X[c+1]-INSET, Y[r+1]-INSET))
        tile = tile.resize((tile.width*SCALE, tile.height*SCALE), Image.LANCZOS)
        m = Image.new("L", tile.size, 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, tile.width-1, tile.height-1), RADIUS, fill=255)
        m = m.filter(ImageFilter.GaussianBlur(1.2))
        tile.putalpha(m)
        tile.save(os.path.join(out, f"{who}-{pose}.webp"), quality=88)
print("done", len(WHO)*len(POSE))
