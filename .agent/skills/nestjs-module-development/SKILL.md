---
name: nestjs-module-development
description: Build or change a DCTD NestJS bounded-context module, controller, DTO, application service, permission guard integration, and tests. Use only for work under api.
---

# NestJS module development

Read the relevant API rules first.

1. Locate the current flow with the navigation skill when unfamiliar. Identify the owning bounded context, delivery wave and whether the module is active or scaffolded.
2. Define validated request DTOs, concrete response DTOs, stable operation IDs, Swagger responses and permission metadata.
3. Keep the controller thin. Put orchestration in an application service and invariants/transitions in named domain behavior.
4. Do not expose empty generic CRUD for scaffolded modules. When persistence is in scope, depend on repositories through owning-module ports; never reach into another module's adapter.
5. Add unit tests for success, validation/invariant failure, permission/transition behavior and idempotency where relevant.
6. State whether behavior remains in-memory or is persisted, then run API lint, tests, OpenAPI export and build.

Do not edit admin/client features as part of this skill. Contract consumers regenerate independently under their own instructions.
