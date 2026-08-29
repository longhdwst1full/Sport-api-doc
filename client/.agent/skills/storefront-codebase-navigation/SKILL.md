---
name: storefront-codebase-navigation
description: Explore DCTD storefront architecture, rendering boundaries, PWA flows, generated API use, or frontend change impact. Use only under client.
---

# Storefront codebase navigation

1. Run `yarn gitnexus status`, then query the user/PWA journey with `yarn gitnexus query --repo dctd-utc "<concept>"`.
2. Use `yarn gitnexus context --repo dctd-utc --file <path> <symbol>` to inspect server/client composition, providers, cart or PWA registration without ambiguity.
3. Before changing an existing symbol, run `yarn gitnexus impact --repo dctd-utc --direction upstream --file <path> <symbol>` and report direct dependants, affected flows and risk.
4. Use `rg --files client/src client/public` for discovery and `rg -n` for an exact route, cache name, operation ID or component. Avoid broad-reading generated SDK files.
5. Trace server/client boundaries, generated data, Redux/Saga interaction state and service-worker caching as separate concerns.
6. After changes, run focused tests, the storefront production gate, then `yarn gitnexus detect-changes --repo dctd-utc --scope all` and verify Git staging was not altered.

Protect the server-component default and do not import admin UI, editors or backend source.
