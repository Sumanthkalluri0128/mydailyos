# FlexFit v25 theme visibility fix

The previous theme CSS targeted `.welcome`, while the actual dashboard uses `.hero2`, `.coach`, `.hero2-minis`, and `.quick`. This update styles the real dashboard components, nutrition and weight cards, and dark themes so selecting a theme produces a visible change. API calls and database records are unchanged.

Run from `client`: `npm install` then `npm run build`.
