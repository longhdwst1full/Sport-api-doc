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
2. Export `api/openapi/openapi.json`.
3. Generate the client SDK under `client/` using the client's local API-integration skill.
4. Generate the admin SDK under `admin/` using the admin's local API-integration skill.

Generated SDKs are separate application artifacts. Neither frontend imports source code from the API or from the other frontend.

## Workspace operations

- Use Yarn 1 only and retain the single root `yarn.lock`.
- Root commands may orchestrate workspaces but do not override an application's local quality gates.
- Do not commit generated build output, caches, `node_modules`, secrets or local environment files.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **dctd-utc** (764 symbols, 1081 relationships, 13 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
