# Contributing · Contribuir

## English

1. Keep the product name **Atrium** (never “Atrium Journal”).
2. Prefer clear, focused PRs.
3. Run `npm run typecheck` before opening a PR.
4. If you change UI that appears in the README, regenerate shots:

```bash
npx vite --config vite.web.mts
# other terminal
npm run shots
```

5. Never commit `.env` or real API keys — only `.env.example`.

## Español

1. El nombre del producto es **Atrium** (nunca “Atrium Journal”).
2. Prefiere PRs claros y acotados.
3. Ejecuta `npm run typecheck` antes de abrir un PR.
4. Si cambias UI del README, regenera las capturas:

```bash
npx vite --config vite.web.mts
# otra terminal
npm run shots
```

5. Nunca subas `.env` ni claves reales — solo `.env.example`.
