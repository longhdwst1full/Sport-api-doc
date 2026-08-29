---
name: admin-codebase-navigation
description: Explore DCTD admin architecture, find feature ownership, trace generated API use, or assess frontend change impact. Use only under admin.
---

# Admin codebase navigation

1. Run `yarn gitnexus status`, then query the UI journey with `yarn gitnexus query --repo dctd-utc "<concept>"`.
2. Use `yarn gitnexus context --repo dctd-utc --file <path> <symbol>` to inspect the page, generated hook, permission gate or store without ambiguity.
3. Before changing an existing symbol, run `yarn gitnexus impact --repo dctd-utc --direction upstream --file <path> <symbol>` and report direct dependants, affected flows and risk.
4. Use `rg --files admin/src` for discovery and `rg -n` for an exact route, permission, operation ID or generated-hook name. Do not broad-read generated SDK output.
5. Trace generated hook → feature mapping → UI separately from Redux/Saga workflow state.
6. After changes, run focused tests, the admin quality gate, then `yarn gitnexus detect-changes --repo dctd-utc --scope all` and verify Git staging was not altered.

Keep CKEditor, charts and other large libraries within their owning lazy feature boundary. Do not apply storefront or API implementation rules.
