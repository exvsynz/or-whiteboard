@AGENTS.md

## Verification

Done-gate for `/resolve-linear-issue` — all must pass:

```
npm run typecheck && npm run lint && npm run test:run && npm run test:e2e && npm run build
```

Use `test:run` (vitest one-shot), NOT `test` (vitest **watch** — hangs a non-interactive run). Green baseline: 211 unit + 10 chromium e2e + tsc + eslint + build.
