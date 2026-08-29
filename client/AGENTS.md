# Storefront client instructions

Scope: `client/` only. Do not load admin Ant Design rules or backend module rules for ordinary storefront work.

## Stack and boundaries

- Next.js App Router, React 19, Tailwind, TanStack Query and a security-conscious PWA layer.
- Prefer server components for public read rendering; add client boundaries only for interaction, browser APIs or client-side query behavior.
- Consume HTTP contracts only from `src/generated/api`. Never import from `admin/` or `api/src`.

## Required routing

- New/changed storefront feature: read `.agent/skills/storefront-feature-development/SKILL.md`.
- API integration or SDK regeneration: read `.agent/skills/client-api-integration/SKILL.md`.
- Service worker, offline, install or update work: read `.agent/skills/pwa-development/SKILL.md`.
- Review/handoff: read `.agent/skills/client-quality-review/SKILL.md`.
- Apply all relevant files in `.agent/rules/`; these rules are local to client.

## Quality gate

Run from the repository root:

```bash
yarn workspace @dctd/client lint
yarn workspace @dctd/client test
yarn workspace @dctd/client build
```

Never manually edit `src/generated/api`.
