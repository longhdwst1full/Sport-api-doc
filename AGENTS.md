# DCTD-UTC workspace instructions

This file governs only monorepo orchestration. Application engineering rules are intentionally not shared.

## Scope routing

- Work under `admin/`: read `admin/AGENTS.md`, then only `admin/.agent/rules` and `admin/.agent/skills`.
- Work under `client/`: read `client/AGENTS.md`, then only `client/.agent/rules` and `client/.agent/skills`.
- Work under `api/`: read `api/AGENTS.md`, then only `api/.agent/rules` and `api/.agent/skills`.
- Never apply a sibling application's skill or UI/backend rule merely because the repository is a Yarn workspace.

## Cross-application contract orchestration

The API owns the HTTP contract. For a contract change:

1. Complete and verify the change under `api/` using its local instructions.
2. Export `api/openapi/openapi.json` and the versioned consumer contract `document/api/openapi-v1.yaml` from the same NestJS document.
3. Generate the client SDK by business domain from `document/api/openapi-v1.yaml` using the client's local API-integration skill.
4. Generate the admin SDK by business domain from `document/api/openapi-v1.yaml` using the admin's local API-integration skill.

Generated SDKs are separate application artifacts. Neither frontend imports source code from the API or from the other frontend.

## Workspace operations

- Use Yarn 1 only and retain the single root `yarn.lock`.
- Root commands may orchestrate workspaces but do not override an application's local quality gates.
- Install every application runtime/build/test dependency in its owning workspace with `yarn workspace @dctd/<app> add <package>` (or `--dev`). Do not use root `yarn add -W` for an application dependency.
- Root `devDependencies` are limited to monorepo orchestration tools used by root scripts. Each app must remain deployable from its own `package.json` plus the root lockfile.
- Yarn 1 may physically hoist packages into the root `node_modules`; dependency ownership is determined by the app `package.json`, not the install location.
- Do not commit generated build output, caches, `node_modules`, secrets or local environment files.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **dctd-utc** (2383 symbols, 3690 relationships, 63 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact analysis before editing.** Use `impact({target: "symbolName", direction: "upstream"})` (MCP) or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .` (CLI fallback); report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
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
