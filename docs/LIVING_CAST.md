# FlexFit Living Cast 2.0

The floating character layer is now a lightweight state-machine animation system.

- Maximum two visible characters.
- Web uses one fixed HTML5 Canvas with `pointer-events:none`.
- Mobile uses one absolute overlay whose animated character roots are also non-interactive.
- Characters are rendered as one composite sprite under a single rigid root. Arms, legs, head and torso are never independently positioned.
- A locked mathematical rig is used for joint/hit-point calculations and a connected-vector fallback if a sprite is unavailable.
- States: idle/breathing, walking, climbing, sleeping/resting, fighting, attacking and dodging.
- Two nearby characters can automatically enter a short alternating fight sequence.
- Web climbing can target the viewport edges and visible cards/buttons/sections.
- Mobile climbing uses the screen edges.
- Reduced-motion/calm mode disables the living cast.

The design deliberately avoids the previous detached-limb failure mode: pose animation changes the single character root/composite image rather than independently animating body parts.
