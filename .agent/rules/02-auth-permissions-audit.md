# Authorization, permissions and audit

- Authentication identifies the actor; authorization checks stable business permissions at the API boundary.
- Permission codes come from `document/05-rbac-permissions.csv` and describe actions such as `inventory.stock.adjust` or `catalog.product.manage`, never controller paths.
- Known gap: decorators currently use `content.post.*` and `review.moderate`, while the catalog defines `cms.content.*` and `catalog.review.*`. Align backend, OpenAPI/admin gates and the catalog in one deliberate change before extending these permissions.
- Tenant/branch/warehouse scope is validated server-side and cannot be trusted from frontend visibility.
- Sensitive mutations capture actor, action, target, timestamp, request ID and an appropriate before/after or domain-event summary once persistence is active.
- Do not log tokens, payment secrets, full PII or unrestricted request bodies.
- Maker-checker approval is opt-in per high-risk use case. Do not impose the securities approval lifecycle on ordinary commerce CRUD.
- `AUTH_BYPASS` and the current `x-permissions` header guard are development scaffolding only. Before production, replace them with verified identity plus deny-by-default permission/data-scope resolution.
