# DCTD-UTC engineering rules

## Contract-first flow

1. Implement or change the NestJS controller and DTO in `api`.
2. Run `yarn workspace @dctd/api openapi:generate`.
3. Run `yarn workspace @dctd/client generate:api` and `yarn workspace @dctd/admin generate:api`.
4. Frontend code imports request functions, React Query hooks and DTOs only from `src/generated/api`.

Never hand-write endpoint URLs, request/response DTO duplicates, or edit generated files. Infrastructure mutators may add base URL, credentials, request ID and normalized errors; they must not contain business DTOs.

## Backend

- Every public endpoint must have Swagger decorators and concrete response DTOs.
- Permission codes are stable business codes, never route-derived.
- Mutating endpoints require validation, permission metadata and idempotency where relevant.
- Controllers stay thin; business rules belong in application services.
- Do not expose persistence entities as API responses.

## Frontend

- `client` is Next.js storefront/PWA-oriented UI with Tailwind.
- `admin` is React/Vite with Ant Design and Tailwind utilities.
- Ant Design controls complex admin interaction; Tailwind owns layout and small visual utilities. Avoid styling the same property from both systems.
- Permission gates improve UX only. The API remains the authorization boundary.
- Do not import one app's source from another app. Shared contracts come from OpenAPI generation.

## Generated code

Generated API folders are disposable. Regenerate instead of patching them. CI must fail when a backend contract change leaves generated SDKs stale.

## Task routing

- API/DTO/SDK work: read `.agents/skills/api-layer/SKILL.md`.
- Storefront offline, installability or service-worker work: read `.agents/skills/pwa-development/SKILL.md`.
- Verification or pre-commit work: read `.agents/skills/code-quality/SKILL.md`.
- Apply the focused rules in `.agent/rules/`; do not import business-specific securities rules into commerce modules.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **dctd-utc** (669 symbols, 964 relationships, 12 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/dctd-utc/context` | Codebase overview, check index freshness |
| `gitnexus://repo/dctd-utc/clusters` | All functional areas |
| `gitnexus://repo/dctd-utc/processes` | All execution flows |
| `gitnexus://repo/dctd-utc/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
