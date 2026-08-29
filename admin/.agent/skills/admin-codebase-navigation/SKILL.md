---
name: admin-codebase-navigation
description: Explore DCTD admin architecture, find feature ownership, trace generated API use, or assess frontend change impact. Use only under admin.
---

# Admin codebase navigation

1. Check GitNexus index freshness. Search by UI/business concept to locate relevant flows and symbols.
2. Inspect full symbol context for the page, hook or store involved. Run upstream impact before editing an existing symbol; report direct dependents, affected flows and risk.
3. Use `rg --files` for file discovery and `rg` for exact route, permission, operation ID or generated-hook names. Do not broad-read generated SDK output.
4. Trace data from generated hook to feature mapping and UI. Distinguish TanStack Query server state from Redux workflow/UI state.
5. After changes, run focused tests first, then admin lint/test/build and GitNexus change detection.

Keep CKEditor, charts and other large libraries within their owning lazy feature boundary. Do not apply storefront or API implementation rules.
