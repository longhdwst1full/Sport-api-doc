---
name: client-api-integration
description: Integrate the DCTD storefront with public NestJS operations through its own Orval SDK, server/client data boundaries, and TanStack Query transport. Use only for client API consumption or SDK regeneration.
---

# Storefront API integration

The backend contract must already exist in `api/openapi/openapi.json`.

1. Run `yarn workspace @dctd/client generate:api` from the repository root.
2. Confirm the operation has a `Storefront *` tag and inspect nullability, cache relevance, auth behavior and error responses.
3. Use generated request functions/types for explicit server reads or generated hooks for browser interaction; do not duplicate endpoint URLs or DTOs.
4. Keep personalized responses out of shared rendering/service-worker caches.
5. Make query freshness reflect the domain: content can be longer-lived; price, stock and checkout validation must be fresh enough for purchase decisions.
6. Review the generated diff for admin tag leakage/deletions, then run client lint, tests and build.

If the contract is wrong, fix it using the API project's local instructions, export it, then regenerate this SDK.
