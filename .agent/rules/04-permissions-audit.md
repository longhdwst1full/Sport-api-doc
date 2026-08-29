# Permissions, transitions and audit

- UI permission gates are convenience only; the API guard is authoritative.
- Permission codes are stable business actions such as `catalog.product.view`, never inferred from URLs.
- Every sensitive mutation records actor, timestamp, action, target, before/after summary and request ID when persistence is introduced.
- State transitions are explicit domain rules. Orders, payments, inventory movements, returns and reviews cannot jump states via generic CRUD updates.
- V1 admin content/product edits are direct but audited. Maker-checker approval is opt-in for high-risk modules; do not copy the securities approval state machine globally.
