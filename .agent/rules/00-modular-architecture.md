# NestJS modular architecture

- One business capability owns its HTTP contract, service, state and persistence boundary under `src/modules/<feature>`.
- Application-wide ownership is explicit: `config` for typed environment config, `common` for reusable framework concerns, `database` for Prisma lifecycle, and `integrations` for third-party ports/adapters.
- A small feature may remain flat. Once it has multiple controllers, DTO groups, services, repositories or enums, use `controllers/`, `dto/`, `services/`, `repositories/`, `enums/` inside that feature.
- A large domain such as Catalog owns nested Nest modules such as `catalog/products`; create `categories`, `brands` or `product-variants` only when their first real use case is implemented.
- Keep controllers limited to HTTP mapping/decorators. A service may own the related V1 use cases of one cohesive feature; split a policy, processor or use-case class only when it has independent complexity, reuse, transaction boundaries or tests.
- Do not create `interfaces/application/domain/infrastructure` folders or one command/query class per endpoint by default. Folder depth must follow actual complexity, not a Java package template.
- A module must not inject another module's repository. Depend on an exported service with a narrow public method or a deliberate domain/integration event.
- Persistence entities and ORM details never appear in response DTOs.
- Reusable auth guards, error filters and decorators stay under `src/common`; bootstrap/OpenAPI mechanics may remain under `src/platform` because they are application composition, not reusable business helpers.
- V1 is a modular monolith. Do not add microservices, Kafka, CQRS infrastructure or distributed transactions without a measured requirement.
- A service must still remain cohesive. When it grows beyond one capability, split the Nest module or extract the specific policy/processor; do not accumulate unrelated catalog, inventory, order and payment behavior in one service.
- Current active HTTP slices are Catalog, Inventory, CMS Content and Product Reviews. Other module boundaries are `SCAFFOLDED`; do not expose generic CRUD merely to make a scaffold look complete.
- Use `src/modules/README.md` and `document/07-delivery-plan.md` to decide when a scaffold becomes active.
