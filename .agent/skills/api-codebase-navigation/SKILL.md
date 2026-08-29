---
name: api-codebase-navigation
description: Explore DCTD API bounded contexts, trace NestJS execution flows, find model ownership, or assess backend change impact. Use only under api.
---

# API codebase navigation

1. Run `yarn gitnexus status`, then query the use case with `yarn gitnexus query --repo dctd-utc "<concept>"`.
2. Use `yarn gitnexus context --repo dctd-utc --file <path> <symbol>` to inspect controller/service/platform flow without ambiguity.
3. Before changing an existing symbol, run `yarn gitnexus impact --repo dctd-utc --direction upstream --file <path> <symbol>` and report direct dependants, affected flows and risk.
4. Use `rg --files api/src api/scripts` for discovery and `rg -n` for an exact DTO, permission, table, error code or operation ID.
5. Trace controller, application service, domain policy, repository port and adapter separately; identify whether the slice is active in-memory or only scaffolded.
6. After changes, run focused tests, the API quality gate, then `yarn gitnexus detect-changes --repo dctd-utc --scope all` and verify Git staging was not altered.

Do not edit generated frontend SDKs or apply frontend rules while using this skill.
