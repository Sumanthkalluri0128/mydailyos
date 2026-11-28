# FlexFit Mobile 2.3.2

Expo SDK 57 mobile client for FlexFit.

## Setup

```bash
npm install
npx expo install --fix
npx expo-doctor
npx expo start -c
```

The app uses the shared FlexFit backend and JWT stored in Expo SecureStore.

Daily History uses the canonical endpoint:
`GET /api/progress/day?date=YYYY-MM-DD`

Progress uses:
`GET /api/progress/history?from=YYYY-MM-DD&to=YYYY-MM-DD`


## SDK 57 navigation note
The tabs use Expo Router navigation only. `@react-navigation/native` is intentionally not imported or installed because Expo Router SDK 56+ rejects direct React Navigation imports.
