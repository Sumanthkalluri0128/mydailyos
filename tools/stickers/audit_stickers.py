#!/usr/bin/env python3
"""Sticker audit: finds stickers that look cut off, tiny or mostly empty and writes stickerBlocklist.json.

Stickers are tight-cropped to their outline, so "visible pixels touch the border" is true for every image.
A cut-off head / hand / foot looks different: the opaque body runs along the image edge in a long straight line.
So each edge is scored by its longest CONTIGUOUS run of opaque pixels (alpha > 200) as a share of the edge length.

  cropped        longest opaque run on any edge >= 15 % of that edge (and >= 12 px)
  tiny           the longer side is under 96 px, or the area is under 9 000 px
  mostly-empty   under 30 % of the picture is visible (alpha > 24)

Usage (run from the project root, web or mobile; the same script works in both):
  python3 tools/stickers/audit_stickers.py            # report + write the blocklist
  python3 tools/stickers/audit_stickers.py --apply    # also prune the generated sticker lists (see below)
  python3 tools/stickers/audit_stickers.py --check    # exit 1 if a blocked sticker is still listed (CI)

Writes   web:    client/src/motion/stickerBlocklist.json
         mobile: src/motion/stickerBlocklist.json
--apply  web:    client/src/motion/stickerManifest.js and server/data/stickerCatalog.json
         mobile: src/motion/stickerImages.ts
Image files are never deleted or edited: the blocklist is the single switch, so a false positive is one line to undo.
The lookup code (pickSticker / stickerFor / stickerById / stickersOf) also skips blocklisted ids at runtime.
"""
import argparse, json, os, re, sys
from PIL import Image

EDGE_RUN_FRAC, EDGE_RUN_MIN_PX = 0.15, 12
TINY_LONG_SIDE, TINY_AREA, EMPTY_FRAC = 96, 9000, 0.30
OPAQUE, VISIBLE = 200, 24


def longest_run(flags):
    best = cur = 0
    for f in flags:
        cur = cur + 1 if f else 0
        best = max(best, cur)
    return best


def analyse(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    a = im.getchannel("A")
    buf = a.tobytes()
    at = lambda x, y: buf[y * w + x]
    edges = {
        "top": [at(x, 0) > OPAQUE for x in range(w)],
        "bottom": [at(x, h - 1) > OPAQUE for x in range(w)],
        "left": [at(0, y) > OPAQUE for y in range(h)],
        "right": [at(w - 1, y) > OPAQUE for y in range(h)],
    }
    frac = {k: longest_run(v) / len(v) for k, v in edges.items()}
    runpx = {k: longest_run(v) for k, v in edges.items()}
    visible = sum(1 for v in buf if v > VISIBLE) / (w * h)
    reasons = []
    for k in edges:
        if frac[k] >= EDGE_RUN_FRAC and runpx[k] >= EDGE_RUN_MIN_PX:
            reasons.append(f"cropped: {k} edge {round(frac[k] * 100)}% opaque")
    if max(w, h) < TINY_LONG_SIDE or w * h < TINY_AREA:
        reasons.append(f"tiny: {w}x{h}px")
    if visible < EMPTY_FRAC:
        reasons.append(f"mostly empty: {round(visible * 100)}% visible")
    return {"w": w, "h": h, "edge": {k: round(v, 3) for k, v in frac.items()}, "visible": round(visible, 3), "reasons": reasons}


def project(root):
    if os.path.isdir(os.path.join(root, "client", "public", "stickers")):
        return {"kind": "web", "assets": os.path.join(root, "client/public/stickers"), "out": os.path.join(root, "client/src/motion/stickerBlocklist.json"),
                "manifest": os.path.join(root, "client/src/motion/stickerManifest.js"), "catalog": os.path.join(root, "server/data/stickerCatalog.json")}
    if os.path.isdir(os.path.join(root, "assets", "stickers")):
        return {"kind": "mobile", "assets": os.path.join(root, "assets/stickers"), "out": os.path.join(root, "src/motion/stickerBlocklist.json"),
                "images": os.path.join(root, "src/motion/stickerImages.ts")}
    sys.exit("Run from the web project root (has client/ and server/) or the mobile project root (has assets/stickers).")


def load_blocked(out):
    try:
        return set(json.load(open(out))["ids"])
    except Exception:
        return set()


def prune_web(p, blocked):
    src = open(p["manifest"], encoding="utf-8").read()
    m = re.search(r"export default (\{.*\});", src, re.S)
    man = json.loads(m.group(1))
    for who in list(man):
        for cat in list(man[who]):
            man[who][cat] = [e for e in man[who][cat] if f"{who}/{e[0]}" not in blocked]
            if not man[who][cat]:
                del man[who][cat]
    head = src[: m.start()]
    open(p["manifest"], "w", encoding="utf-8").write(head + "export default " + json.dumps(man, separators=(",", ":")) + ";\n")
    if os.path.exists(p["catalog"]):
        cat = json.load(open(p["catalog"]))
        for who in list(cat):
            for c in list(cat[who]):
                cat[who][c] = [n for n in cat[who][c] if f"{who}/{n}" not in blocked]
                if not cat[who][c]:
                    del cat[who][c]
        json.dump(cat, open(p["catalog"], "w"), separators=(",", ":"))


def prune_mobile(p, blocked):
    lines = open(p["images"], encoding="utf-8").read().split("\n")
    out, who, cat, buf = [], None, None, []
    for ln in lines:
        m = re.match(r"^  (\w+): \{$", ln)
        if m and not ln.startswith("    "):
            who = m.group(1)
        m2 = re.match(r"^    (\w+): \[$", ln)
        if m2:
            cat, buf = m2.group(1), [ln]
            continue
        if buf:
            buf.append(ln)
            if ln == "    ],":
                items = [b for b in buf[1:-1] if f"{who}/{re.search(r"name: '([^']+)'", b).group(1)}" not in blocked]
                if items:
                    out.extend([buf[0], *items, buf[-1]])
                buf = []
            continue
        out.append(ln)
    open(p["images"], "w", encoding="utf-8").write("\n".join(out))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".")
    ap.add_argument("--apply", action="store_true", help="prune the generated sticker lists using the blocklist")
    ap.add_argument("--check", action="store_true", help="fail if any blocked sticker is still in the generated lists")
    a = ap.parse_args()
    p = project(os.path.abspath(a.root))
    if a.check:
        blocked = load_blocked(p["out"])
        text = open(p.get("manifest") or p["images"], encoding="utf-8").read()
        if p["kind"] == "mobile":
            left = [b for b in sorted(blocked) if f"stickers/{b}.webp" in text]
        else:
            man = json.loads(re.search(r"export default (\{.*\});", text, re.S).group(1))
            left = [b for b in sorted(blocked) if any(e[0] == b.split("/")[1] for c in man.get(b.split("/")[0], {}).values() for e in c)]
        print("blocked ids still listed:", left or "none")
        sys.exit(1 if left else 0)

    rows, ids, details = [], [], {}
    for who in sorted(os.listdir(p["assets"])):
        d = os.path.join(p["assets"], who)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".webp"):
                continue
            r = analyse(os.path.join(d, fn))
            sid = f"{who}/{fn[:-5]}"
            rows.append((sid, r))
            if r["reasons"]:
                ids.append(sid)
                details[sid] = {"reasons": r["reasons"], "size": [r["w"], r["h"]]}
    print(f"Audited {len(rows)} stickers in {p['assets']}")
    worst = sorted(rows, key=lambda x: -max(x[1]["edge"].values()))[:5]
    print("Highest edge-run scores:", ", ".join(f"{s} {max(r['edge'].values()):.2f}" for s, r in worst))
    if ids:
        print(f"FLAGGED {len(ids)}:")
        for sid in ids:
            print(f"  {sid:28s} {'; '.join(details[sid]['reasons'])}")
    else:
        print("Nothing flagged.")
    os.makedirs(os.path.dirname(p["out"]), exist_ok=True)
    json.dump({"note": "Written by tools/stickers/audit_stickers.py. Add or remove an id by hand to override.",
               "rules": {"edgeRunFraction": EDGE_RUN_FRAC, "tinyLongSidePx": TINY_LONG_SIDE, "emptyFraction": EMPTY_FRAC},
               "ids": ids, "details": details}, open(p["out"], "w"), indent=1)
    print("Wrote", os.path.relpath(p["out"], os.path.abspath(a.root)))
    if a.apply:
        (prune_web if p["kind"] == "web" else prune_mobile)(p, set(ids))
        print("Pruned generated sticker lists.")


if __name__ == "__main__":
    main()
