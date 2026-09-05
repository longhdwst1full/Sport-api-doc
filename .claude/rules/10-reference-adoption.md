# Backend reference adoption

Use Java services in the workspace to reference operational maturity: typed config, startup migration/release mode, transaction boundaries, optimistic concurrency, authorization/scope, audit and deterministic error contracts.

Keep NestJS module granularity pragmatic. A bounded context may contain controller, DTO, service/use-case and repository without mirroring every Java class. Extract only when ownership, reuse or test isolation is clear. Prisma migration and generated OpenAPI remain authoritative.
