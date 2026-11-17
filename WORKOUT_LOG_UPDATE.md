# Workout logger update

- Treadmill entries now accept the treadmill's displayed speed in km/h plus duration and incline; the app converts speed internally for calorie estimation.
- Rowing machine entries include distance (metres), stroke rate (spm), split per 500 m (seconds), duration, and effort.
- Cross trainer / elliptical and stationary cycle entries include duration, distance (km), resistance, cadence (RPM), and effort.
- Farmer's Carry / Farmer's Walk entries record steps and separate left- and right-hand loads, with optional duration. If duration is omitted, a conservative duration estimate is derived from steps for calorie estimation.
- Mobility Flow, Dynamic Mobility, and Stretching Routine are available under Mobility and are logged by minutes. Custom mobility activities can also be entered as timed exercises.
- Machine calorie estimates use effort bands (easy / moderate / hard); treadmill estimates use speed and incline. Calories remain estimates, not device-grade measurements.

The web and mobile source changes are kept in sync for the shared gym maths and exercise catalogue.

## v78 per-set correction
All special exercise metrics now appear within each individual set row for Farmer's Walk, Rowing Machine, Cross Trainer, and Stationary Cycle. Each row saves its own data independently; identical rep/step values no longer cause one set's metrics to be copied onto another.
