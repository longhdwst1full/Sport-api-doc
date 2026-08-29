---
name: api-codebase-navigation
description: Explore DCTD API bounded contexts, trace NestJS execution flows, find model ownership, or assess backend change impact. Use only under api.
---

# API codebase navigation

1. Check GitNexus index freshness and query the business use case to find controller-to-domain execution flows.
2. Inspect symbol context for callers, callees and process membership. Run upstream impact before editing an existing symbol; report direct dependents, flows and risk.
3. Use `rg --files` for file discovery and `rg` for exact DTO, permission, table, error code or operation ID names.
4. Trace controller, application service, domain policy, repository port and persistence adapter as separate responsibilities.
5. After changes, run focused tests, API lint/test/OpenAPI/build and GitNexus change detection.

Do not edit generated frontend SDKs or apply frontend rules while using this skill.
