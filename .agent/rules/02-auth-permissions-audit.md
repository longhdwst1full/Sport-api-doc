# Authorization, permissions and audit

- Authentication identifies the actor; authorization checks stable business permissions at the API boundary.
- Permission codes describe actions such as `inventory.adjust` or `review.moderate`, never controller paths.
- Tenant/branch/warehouse scope is validated server-side and cannot be trusted from frontend visibility.
- Sensitive mutations capture actor, action, target, timestamp, request ID and an appropriate before/after or domain-event summary once persistence is active.
- Do not log tokens, payment secrets, full PII or unrestricted request bodies.
- Maker-checker approval is opt-in per high-risk use case. Do not impose the securities approval lifecycle on ordinary commerce CRUD.
