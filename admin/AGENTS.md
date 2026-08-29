# Admin application instructions

Scope: `admin/` only. Do not load storefront PWA rules or backend implementation rules for ordinary admin work.

## Stack and boundaries

- React 19, Vite, React Router, Ant Design, Tailwind, TanStack Query, Axios and Redux Toolkit/Saga.
- React Hook Form/Yup own complex form state and validation. Recharts, react-window and CKEditor are feature-level dependencies and must stay lazy or route-scoped.
- Organize business UI under `src/features/<feature>`; application composition lives in `src/app`; reusable infrastructure lives in `src/core` or `src/lib`.
- Consume the API only through `src/generated/api` and the transport mutator. Never import code from `client/` or `api/src`.

## Required routing

- New/changed admin feature: read `.agent/skills/admin-feature-development/SKILL.md`.
- API integration or SDK regeneration: read `.agent/skills/admin-api-integration/SKILL.md`.
- Review/handoff: read `.agent/skills/admin-quality-review/SKILL.md`.
- Architecture discovery, impact analysis or broad search: read `.agent/skills/admin-codebase-navigation/SKILL.md`.
- Apply all relevant files in `.agent/rules/`; these rules are local to admin.

## Quality gate

Run from the repository root:

```bash
yarn workspace @dctd/admin lint
yarn workspace @dctd/admin test
yarn workspace @dctd/admin build
```

Never manually edit `src/generated/api`.
