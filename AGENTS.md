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
