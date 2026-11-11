# Where the extra folders go
Put `web/` (this project) and `mobile/MyDailyOSMobile/` side by side in ONE git repo, then copy to the repo root:
- `repo-root-tools/`    -> `tools/`
- `repo-root-github/`   -> `.github/`
- `repo-root-packages/` -> `packages/`   (the shared code both apps use; see packages/shared/README.md)
- `repo-root-version.json` -> `version.json`
CI, `node tools/syncVersion.mjs` and `node tools/syncShared.mjs` expect that layout.
