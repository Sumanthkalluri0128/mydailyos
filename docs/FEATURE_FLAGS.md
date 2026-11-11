# Feature flags (staged rollouts)

Flags let you turn a big change on for a few people first, then more, then everyone. The server decides per person; both apps ask `/api/flags` (phone keeps the answer 6 hours).

## Rolling out the one-plan Smart program (`smart-program`)
Until the flag exists, EVERYONE has Smart (nothing changes for you today). To stage it:
1. Admin flags (`PUT /api/admin/flags/smart-program`): `{ "enabled": true, "percent": 10, "allow": ["you@example.com"] }`.
   Only those people get Smart (you, plus 10% of everyone). Everyone else keeps the Classic 7-day plan.
2. Watch Sentry errors and feedback for a few days. Raise `percent` to 25, 50, 100. Raising it only ever ADDS people, nobody loses it.
3. `deny: ["id or email"]` removes someone, `enabled: false` turns it off for everyone (they fall back to Classic at their next app open or within 6 hours).
Rules: `server/lib/flags.js` (tested). Use the same pattern for the next big change: `useFlag("name", true)` keeps today's behaviour until the flag is created.
