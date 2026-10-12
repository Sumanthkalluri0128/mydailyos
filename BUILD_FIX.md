# Build fix for Vercel

The Vercel build failed because `client/src/utils/useShowMore.js` contains JSX. Vite's import analysis treats `.js` as JavaScript and fails on the JSX `<button>` element.

## Fix applied
- Renamed `client/src/utils/useShowMore.js` to `client/src/utils/useShowMore.jsx`.
- Existing extensionless imports (`../utils/useShowMore`) are supported by Vite and do not need to change.
- No application logic, API calls, database data, or environment variables were changed for this fix.

## Verify
From the `client` directory:

```bash
npm install
npm run build
```

Then commit and push the change to trigger a new Vercel deployment.
