# FlexFit Living Cast 3.0

The Living Cast is a lightweight, pointer-transparent animation overlay.

## Behavior
- Maximum 2 characters visible at once.
- Characters maintain a collision/separation radius during normal roaming; they never sit on top of one another.
- Characters can walk, idle, sleep, eat, dance, meditate, jump, climb UI ledges, climb a rope from bottom to top, and climb a procedural mountain path.
- When two awake characters meet, they stop at a deliberate fighting distance and alternate attacks instead of overlapping.
- Combat includes punch, kick, dash, block, dodge, and character-specific special effects: Rasengan, Kamehameha, Gear Attack, Shadow Strike, Three Sword Slash, and Domain.
- Special effects are mathematically anchored to the same character root. The character itself remains one complete sprite, so arms/legs/head cannot detach.
- The web version uses one HTML5 Canvas and requestAnimationFrame. No game engine is required.
- `pointer-events:none` keeps the page underneath clickable.

## Character rigidity
The walk cycle is cropped from the 8-frame composite walk strip. Only one 256px frame is sampled per animation frame. Combat never splits the source sprite into separate DOM/canvas body parts.
