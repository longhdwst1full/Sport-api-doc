# Admin permissions and state transitions

- Permission gates control visibility and affordances only. The API is always authoritative.
- Use stable action codes and never derive permissions from a URL string. `catalog.product.*` and `inventory.stock.*` currently match the RBAC catalog.
- Known gap: source uses `content.post.*` and `review.moderate`, while `document/05-rbac-permissions.csv` defines `cms.content.*` and `catalog.review.*`. Resolve API decorators, admin gates/env and the catalog together before expanding those modules; do not add a third naming variant.
- Hide unavailable navigation, disable unavailable contextual actions when explanation is useful, and handle API 403 consistently.
- Orders, payments, inventory, returns, reviews and publishing use explicit action endpoints/transitions. Do not implement status changes as a generic editable select.
- High-risk actions show current state, requested action and business consequence before confirmation.
- Do not import the securities maker-checker workflow globally; approval is enabled only for modules whose business policy requires it.
- `VITE_DEV_PERMISSIONS` and the `x-permissions` header are local scaffolding only. They are not identity, scope enforcement or a production authorization mechanism.
