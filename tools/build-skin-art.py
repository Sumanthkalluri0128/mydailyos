#!/usr/bin/env python3
"""Cut the 20 banner scenes out of the reference sheet and enhance them for the web.
usage: python3 tools/build-skin-art.py <sheet.png> <out dir (client/public/skins)>
Steps per scene: crop (drops the label chip), denoise, 2x upscale + light edge-aware smoothing + sharpen (twice = 4x), light local contrast."""
import sys, cv2, numpy as np
from PIL import Image
sheet, out = sys.argv[1], sys.argv[2]
IDS = ["s01-sakura","s02-mountain","s03-neon","s04-gym","s05-modern","s06-sunset","s07-forest","s08-night-city","s09-sky","s10-arena",
       "s11-snow","s12-library","s13-rain","s14-autumn","s15-ocean","s16-stars","s17-temple","s18-cyber","s19-bamboo","s20-rooftop"]
X = [(0, 383), (385, 767), (769, 1151), (1153, 1536)]
Y = [(0, 205), (207, 409), (411, 612), (614, 815), (817, 1024)]
img = cv2.cvtColor(np.asarray(Image.open(sheet).convert("RGB")), cv2.COLOR_RGB2BGR)

def sharpen(a, sigma, amount):
    blur = cv2.GaussianBlur(a, (0, 0), sigma)
    return cv2.addWeighted(a, 1 + amount, blur, -amount, 0)

for i, name in enumerate(IDS):
    (x0, x1), (y0, y1) = X[i % 4], Y[i // 4]
    t = img[y0 + 38:y1 - 2, x0 + 2:x1 - 2]            # 38px off the top removes the label chip and the corner dot
    t = cv2.fastNlMeansDenoisingColored(t, None, 4, 4, 5, 17)          # remove the compression noise first
    for _ in range(2):                                                   # 2x, then 2x again, cleaning edges each time
        t = cv2.resize(t, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        t = cv2.bilateralFilter(t, 5, 14, 3)                             # soften blockiness, keep outlines
        t = sharpen(t, 1.1, 0.42)                                        # gentle: just restores line crispness
    lab = cv2.cvtColor(t, cv2.COLOR_BGR2LAB)
    lab[:, :, 0] = cv2.createCLAHE(clipLimit=1.1, tileGridSize=(6, 4)).apply(lab[:, :, 0])
    t = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    hsv = cv2.cvtColor(t, cv2.COLOR_BGR2HSV).astype(np.float32); hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.04, 0, 255)
    t = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    Image.fromarray(cv2.cvtColor(t, cv2.COLOR_BGR2RGB)).save(f"{out}/{name}.webp", quality=90, method=6)
    print(name, t.shape[1], "x", t.shape[0])
