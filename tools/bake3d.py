#!/usr/bin/env python3
"""
Bakes "3D volume" into the flat sticker sprites.

For every sprite we build a soft height-field from the alpha silhouette (a puffy dome that is
highest in the middle and falls to zero at the outline), derive surface normals from it, and light
it from the top-left. The result is a gentle bevel: lit rim on the light side, shaded rim on the
far side, a faint specular glint, plus a soft top-to-bottom light falloff. The interior artwork is
left alone, so the characters keep their look and just stop reading as flat paper.

Walk/run/climb strips are 16 frames of 256px; they are processed frame-by-frame so the bevel never
bleeds across frame borders.

Usage:  python3 bake3d.py <src_dir> <out_dir>
"""
import sys, os, glob
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

FRAME = 256
LIGHT = np.array([-0.52, -0.68, 0.52], dtype=np.float32)
LIGHT /= np.linalg.norm(LIGHT)
VIEW = np.array([0, 0, 1], dtype=np.float32)
HALF = LIGHT + VIEW
HALF /= np.linalg.norm(HALF)

BEVEL_PX = 9.0       # how far in from the outline the dome curves (px at 256)
BUMP = 3.2           # normal steepness
DIFFUSE = 0.85       # strength of the lit/shaded rim
SPEC = 0.38          # strength of the specular glint
TOP_LIGHT = 0.10     # vertical light falloff across the figure


def shade_frame(rgba: np.ndarray) -> np.ndarray:
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    a = rgba[..., 3].astype(np.float32) / 255.0
    solid = a > 0.55
    if solid.sum() < 40:
        return rgba

    # Sprites cropped by the canvas edge must not get a bevel along that cut, so pad by replicating.
    pad = 24
    m = np.pad(solid, pad, mode="edge")
    d = ndi.distance_transform_edt(m)
    h = 1.0 - np.exp(-d / (BEVEL_PX * 0.55))           # dome profile: 0 at the rim -> ~1 inside
    h = ndi.gaussian_filter(h, 1.6)
    gy, gx = np.gradient(h)
    nx, ny, nz = -gx * BUMP * BEVEL_PX, -gy * BUMP * BEVEL_PX, np.ones_like(h)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx * inv, ny * inv, nz * inv
    crop = (slice(pad, -pad), slice(pad, -pad))
    nx, ny, nz = nx[crop], ny[crop], nz[crop]

    ndl = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
    delta = ndl - LIGHT[2]                              # 0 on flat interior, +/- on the bevel
    ndh = np.clip(nx * HALF[0] + ny * HALF[1] + nz * HALF[2], 0, 1)
    spec = np.power(ndh, 38.0) * (1.0 - np.clip(nz, 0, 1)) * 1.8   # only where the surface actually tilts

    weight = np.clip((a - 0.55) / 0.45, 0, 1)           # leave glow / aura fringes alone
    yy = np.linspace(0, 1, rgba.shape[0], dtype=np.float32)[:, None]
    ys, xs = np.where(solid)
    y0, y1 = ys.min(), ys.max() + 1
    yf = np.clip((yy * rgba.shape[0] - y0) / max(1, (y1 - y0)), 0, 1)      # 0 top of figure .. 1 bottom
    vert = 1.0 + TOP_LIGHT * (0.5 - yf)

    gain = (1.0 + DIFFUSE * delta * 1.4) * vert
    out = rgb * (1.0 + (gain - 1.0) * weight)[..., None]
    out = out + (spec * SPEC * weight)[..., None] * (1.0 - 0.35 * out)  # glint, softened on already-bright pixels
    out = np.clip(out, 0, 1)

    res = rgba.copy()
    res[..., :3] = (out * 255.0 + 0.5).astype(np.uint8)
    return res


def wall_frame(rgba: np.ndarray) -> np.ndarray:
    """Dark, hard-edged silhouette used for the side of the slab: flat colour (a darkened average of the art), alpha thresholded
    so glows / auras / anti-aliased fringes never stack up into mud when many layers are drawn on top of each other."""
    a = rgba[..., 3].astype(np.float32) / 255.0
    solid = a > 0.5
    out = np.zeros_like(rgba)
    if solid.sum() < 20:
        return out
    col = rgba[..., :3][solid].astype(np.float32).mean(axis=0)
    col = np.clip(col * 0.36 + np.array([6, 5, 10], dtype=np.float32), 0, 255)
    out[..., :3] = col.astype(np.uint8)
    out[..., 3] = (np.clip((a - 0.5) * 5.0, 0, 1) * 255).astype(np.uint8)
    return out


def frames(arr):
    h, w = arr.shape[:2]
    if w > h and w % FRAME == 0 and h == FRAME:
        return [slice(i * FRAME, (i + 1) * FRAME) for i in range(w // FRAME)]
    return [slice(0, w)]


def bake(path_in: str, path_out: str):
    im = Image.open(path_in).convert("RGBA")
    src = np.array(im)
    arr, wall = src.copy(), np.zeros_like(src)
    for sl in frames(src):                                  # strips are 16 frames: shade each one on its own
        arr[:, sl] = shade_frame(src[:, sl])
        wall[:, sl] = wall_frame(src[:, sl])
    Image.fromarray(arr, "RGBA").save(path_out, "WEBP", quality=90, method=3, alpha_quality=100)
    wdir = os.path.join(os.path.dirname(path_out), "walls")
    os.makedirs(wdir, exist_ok=True)
    Image.fromarray(wall, "RGBA").save(os.path.join(wdir, os.path.basename(path_out)), "WEBP", lossless=True, method=4)


def _job(a):
    bake(*a)


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src, "*.webp")))
    from multiprocessing import Pool
    jobs = [(f, os.path.join(out, os.path.basename(f))) for f in files]
    with Pool(max(1, os.cpu_count() or 1)) as pool:
        for i, _ in enumerate(pool.imap_unordered(_job, jobs)):
            if i % 30 == 0:
                print(f"{i}/{len(files)}", flush=True)
    print("baked", len(files), "sprites ->", out)
