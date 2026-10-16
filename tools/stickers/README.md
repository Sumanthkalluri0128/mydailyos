# Sticker pipeline
The 13 characters come from sticker-sheet PNGs (one per character, ~45 stickers each, white-outline stickers on a gray glow).
1. `slide.py` — slides a window over each row band of every sheet and runs the `silueta` background-removal model (rembg)
   on each window; keeps stickers that sit fully inside a window. `PASS2=2 python slide.py 0 1` re-runs weak sheets with taller bands.
2. `finalize.py <out>` — merges both passes, removes duplicates/bad cuts, labels stickers (row position + colour tests for
   cry / love), writes `<out>/<who>/<category>-<n>.webp` and `manifest.json`.
3. `export_stickers.py` — copies them into the web app (`client/public/stickers`, `src/motion/stickerManifest.js`) and the
   mobile app (`assets/stickers`, `src/motion/stickerImages.ts`).
Paths inside the scripts point at the original sheet folder; edit `U` in `build.py` and the paths in `export_stickers.py`.
