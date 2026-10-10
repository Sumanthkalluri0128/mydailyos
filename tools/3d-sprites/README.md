# 3D sprite pipeline
1. `python3 extract.py <transparent-sheet.png> poses/` – cuts the sheet into poses/00.png … (touching poses are separated by connected regions; stray bits like a detached tail are re-attached).
2. `python3 build_sprites.py poses/ <out-dir> <who>` – writes `<who>-<pose>.webp` stills plus `walkstrip`/`runstrip`/`climbstrip` (16 frames, 256px each).
3. Copy the output into `client/public/chars/` (web) or `assets/chars/` (mobile). Scene→pose mapping lives in `chars.js` / `chars.ts`.
To add a character: run the steps with a new `<who>`, add it to `CHARS`, `POSE`, `ROPE_X` (and `charImages.ts` on mobile). Pose order in the sheet is documented by `NAMES` in build_sprites.py (extract order must match).
