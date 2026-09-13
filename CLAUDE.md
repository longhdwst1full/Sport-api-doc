# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# API context

Read `AGENTS.md` and the task-relevant files under `.agent/rules` and `.agent/skills` before changing this repository. Do not import Admin or Storefront rules.

## Commands

```bash
yarn dev                 # nest start --watch (prestart runs prisma generate + migrate-on-start)
yarn lint                # eslint {src,scripts,test}/**/*.ts
yarn test                # jest unit specs (*.spec.ts under src/)
yarn test:integration    # test/jest-integration.json, --runInBand (needs .env.local DB)
yarn test:e2e            # test/jest-e2e.json
yarn build               # prisma validate + generate + migrate-on-deploy + nest build
yarn verify              # lint + test + build

yarn openapi:generate    # build, then emit openapi/openapi.json + document/api slices
yarn contracts:check     # regenerate and fail if the committed contract drifted

yarn db:status | db:migrate | db:seed | db:admin:reset
yarn db:seed:demo --confirm-manual-seed   # manual-only demo data, never in deploy
```

Single test: `yarn jest src/modules/catalog/products/services/x.spec.ts -t "case name"`.
Full gate before handoff: `yarn lint && yarn test && yarn prisma:validate && yarn openapi:generate && yarn build`.

Dev uses the configured Supabase PostgreSQL (`DATABASE_URL` pooled, `DIRECT_URL` for migrations) — do not start a local DB container.

## Architecture

NestJS 11 modular monolith, Prisma/PostgreSQL, Swagger-generated OpenAPI. This repo is the **contract producer**: DTO/controller code → `openapi/openapi.json` + `document/api/openapi-v1.yaml` + per-domain Admin/Storefront slices, which Admin and Client sync and run through Orval. Never hand-write a contract downstream.

- **Bounded contexts** live in `src/modules/<context>` (catalog, inventory, cart, checkout, order, payment, fulfillment, cms, review, iam, organization, …). `src/modules/README.md` is the authoritative ACTIVE vs SCAFFOLDED registry — a SCAFFOLDED module has a Nest boundary and registered models but deliberately no generic CRUD controller, because that would bypass state-machine, audit, idempotency and transaction rules. Two shapes: compact feature module (Organization/IAM) or nested `controllers/dto/services` (Catalog/Products). Prisma repositories stay inside the owning module.
- **Composition.** `src/platform/app.factory.ts` owns the whole HTTP surface: global prefix `api/v1`, helmet + compression + credentialed CORS, the global `ValidationPipe`/exception filter, and `buildOpenApiDocument` (operationId = method name, which is what gives the generated SDKs their function names). `src/app.module.ts` wires config validation (`src/config/env.validation.ts`), pino logging with `x-request-id` propagation, Throttler and the global `PermissionGuard`.
- **Layers.** `src/common` cross-cutting guards/decorators/filters/exceptions/pagination (`@RequireAuthentication`, `@RequirePermissions`), `src/config` typed config namespaces, `src/database` Prisma lifecycle only, `src/integrations` third-party ports/adapters (Cloudinary object storage, shipping partner, Telegram), `src/platform` app/OpenAPI/runtime plumbing.
- **OpenAPI generation** runs against the compiled `dist/` with `AUTH_BYPASS=true` and `DATABASE_ENABLED=false` (`scripts/generate-openapi.cjs`), so it must not need a live DB — keep module construction side-effect free.
- **Model traceability.** `system/model-registry.data.ts` is the executable coverage manifest for the reviewed 74-table V1 model (`document/09-v1-model.dbml`); its unit test fails if a table silently disappears. Any DB/contract/permission/error change also updates the annotated workbook (`.agent/skills/db-api-document-traceability/SKILL.md`).
- Modules with transactions, concurrency, providers or a state machine carry their own `README.md`; `src/modules/checkout/README.md` is the reference.

Generated output (`openapi/`, `document/api/`, Prisma Client, `dist/`) is never hand-edited — change the producer and regenerate.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **dctd-utc** (2863 symbols, 7635 relationships, 381 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/dctd-utc/context` | Codebase overview, check index freshness |
| `gitnexus://repo/dctd-utc/clusters` | All functional areas |
| `gitnexus://repo/dctd-utc/processes` | All execution flows |
| `gitnexus://repo/dctd-utc/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
