# v34 - Phase 1: calm Home, cut-off stickers removed, weight blurred until tapped (web + server)
- **Weekly review card** always starts collapsed (slim line with the character's face, smooth open/close, no saved state).
- **Home**: sliding hero images, the blurred scene banner and all auto-advance timers removed. Static hero card with ONE character and one line of the day (changes once per day). Deleted HeroCarousel, MotivationCarousel (unused), home/scenes.js and the matching CSS.
- **Stickers**: tools/stickers/audit_stickers.py (Pillow) flags cut-off / tiny / mostly-empty stickers and writes client/src/motion/stickerBlocklist.json; manifest and server/data/stickerCatalog.json pruned (goku/lift-0, jinwoo/peace-0, tanjiro/chill-1); chars.js filters at runtime.
- **Layout**: corner stickers use container queries and disappear instead of being cropped or covering the plus button; the nutrition, habit and task cards no longer carry a corner sticker over their rows and inputs; the Progress card reserves space for its sticker.
- **WeightReveal** on Home, Weight page, trend chart, Goals, North Star, fat-loss card, Progress, Profile, Insights, Weekly coach. Blurred by default, tap to reveal with dissolve, roll-up, accent glow, buzz and a tiny character; re-blurs after 8 s, when the tab is hidden or when you leave the page.
- "Hide numbers" is now "Hide calorie numbers". Character lines no longer contain weight numbers.
- No server routes or calculations changed. No new environment variables, no migrations.

---

