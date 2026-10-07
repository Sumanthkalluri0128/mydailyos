# FlexFit Living Cast 4.0

The Living Cast is a lightweight, pointer-events-none overlay limited to two characters.

## Animation rules
- Characters are rendered as one complete sprite; no body parts are independently positioned.
- State changes are deliberate and slow. A character does not randomly swap to a different activity image every frame.
- Walking, rope climbing and mountain climbing use the same 8-frame walk cycle at a controlled cadence.
- Rope climbing takes roughly 9–12 seconds and moves continuously from the bottom toward the top.
- Mountain climbing takes roughly 9–13 seconds and follows a smooth eased path.
- Characters are kept apart by a minimum separation distance except during a deliberately staged fight, where they stop at a fixed combat distance.
- Fights use a fixed fight sprite plus whole-body anticipation/lunge/dodge transforms and anchored effects. Special attacks originate from the character root/hand anchor without detaching limbs.

## Activities
Idle/breathing, walking, rope climbing, mountain climbing, jumping, dancing, eating, meditating, sleeping, and staged character-vs-character combat.
