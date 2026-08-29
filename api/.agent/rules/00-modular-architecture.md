# NestJS modular architecture

- One bounded context owns its domain state and persistence ports under `src/modules/<context>`.
- Controllers contain HTTP mapping/decorators only; application services orchestrate use cases; domain functions enforce invariants.
- A module must not inject another module's repository. Depend on an exported application interface or a deliberate domain/integration event.
- Persistence entities and ORM details never appear in response DTOs.
- Platform concerns such as auth guards, error filters, request IDs and logging stay under `src/platform`.
- V1 is a modular monolith. Do not add microservices, Kafka, CQRS infrastructure or distributed transactions without a measured requirement.
- Current active HTTP slices are Catalog, Inventory, CMS Content and Product Reviews. Other module boundaries are `SCAFFOLDED`; do not expose generic CRUD merely to make a scaffold look complete.
- Use `src/modules/README.md` and `document/07-delivery-plan.md` to decide when a scaffold becomes active.
