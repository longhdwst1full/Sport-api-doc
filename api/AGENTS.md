# API application instructions

Scope: `api/` only. Do not load storefront rendering/PWA rules or admin UI rules for backend work.

## Stack and boundaries

- NestJS modular monolith with Swagger/OpenAPI, class-validator and Jest.
- Bounded contexts live under `src/modules`; platform HTTP/auth concerns live under `src/platform`.
- Controllers map HTTP, application services execute use cases, domain policy owns transitions, and persistence adapters remain replaceable.
- The API owns authorization, validation, idempotency and audit requirements.

## Required routing

- New/changed NestJS module or endpoint: read `.agent/skills/nestjs-module-development/SKILL.md`.
- OpenAPI export or contract change: read `.agent/skills/api-contract-generation/SKILL.md`.
- Model, aggregate, transition, transaction or persistence work: read `.agent/skills/domain-model-implementation/SKILL.md`.
- Review/handoff: read `.agent/skills/api-quality-review/SKILL.md`.
- Architecture discovery, execution-flow tracing or impact analysis: read `.agent/skills/api-codebase-navigation/SKILL.md`.
- Apply all relevant files in `.agent/rules/`; these rules are local to API.

## Quality gate

Run from the repository root:

```bash
yarn workspace @dctd/api lint
yarn workspace @dctd/api test
yarn workspace @dctd/api openapi:generate
yarn workspace @dctd/api build
```

Do not change frontend code while following an API-only skill. SDK regeneration is a separate consumer step governed by each frontend's instructions.
