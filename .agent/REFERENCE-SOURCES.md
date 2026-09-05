# API reference policy

API rules are local to this NestJS repository. Java services in the workspace are references for mature operational patterns—config validation, migrate-at-start/release mode, transaction boundaries, authorization/audit and layered responsibilities—not a template for copying Java package granularity into NestJS.

Adapt patterns to `src/common`, `src/config`, `src/database`, `src/modules` and `src/integrations`. Prisma/OpenAPI/NestJS behavior in this repository remains authoritative.
