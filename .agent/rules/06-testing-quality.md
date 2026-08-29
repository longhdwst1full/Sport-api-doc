# API testing and quality

- Unit-test domain invariants and transition matrices without HTTP or database dependencies.
- Controller/contract tests cover validation, status codes, permission metadata and error shape.
- Persistence integration tests use PostgreSQL for constraints, transactions, locking and query behavior; do not claim these are verified by an in-memory repository.
- Every idempotent command tests replay and key/payload conflict. Inventory tests cover reserved/on-hand safety and concurrent intent.
- Assert stable error codes and structured details; avoid brittle assertions on prose messages.
- Required checks are API lint, Jest tests, OpenAPI generation and production build.
- The current Jest suite exercises in-memory services. `test:e2e` is not an achieved gate until its missing test configuration/suite and a real PostgreSQL test environment are added.
- Report separately what is verified by unit, HTTP contract, PostgreSQL integration, concurrency and production-like tests.
