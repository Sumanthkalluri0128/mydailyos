# Syncing steps from Samsung Health

FlexFit can't read Samsung Health directly. Samsung Health shares steps through **Android Health Connect**, and FlexFit reads
them from there. The number then matches what Samsung Health shows (e.g. 23,482), including steps taken while FlexFit was closed.

## One-time setup (≈1 minute)
1. **Samsung Health → ⚙ Settings → Health Connect** (or *Connected services*): allow Samsung Health to **write Steps**.
   Menu names differ slightly between Samsung Health / One UI versions. Health Connect itself is under
   *Settings → Security and privacy → Privacy → Health Connect* on Android 14+; on older Android install it from Play Store.
2. **FlexFit → Health → Steps → "🔗 Sync with Samsung Health"** → tap **Allow** for *Steps*.
3. The card now says "✅ Synced from Samsung Health".

## Important
* This needs a **new app build** (it adds a native module). It cannot arrive as an over-the-air update or in Expo Go:
  `eas build --platform android` (add `--profile <name>` for your preferred profile), then install the new APK/AAB.
* The total refreshes every minute while FlexFit is open and whenever you return to it. When FlexFit is closed nothing runs,
  but the next time you open it the full day's steps are there (that was the old problem: the phone sensor only counted while open).
* FlexFit still calculates calories from steps with its own formula (steps × your weight, counting only activity above your
  baseline), so its "calories burned" will differ from Samsung's 716 kcal. That's intentional: Samsung's figure includes resting
  calories that FlexFit already counts in your daily target.
* The website can't read Samsung Health, but it shows the steps your phone sends to FlexFit.
* If Health Connect shows 0: check step 1, and open Samsung Health once so it syncs.
* "Stop using Health Connect" returns to FlexFit's own counting. iPhones are unaffected (they already count all day).
