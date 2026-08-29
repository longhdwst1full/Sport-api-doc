# Domain transitions and idempotency

- Order, payment, fulfillment, shipment, return, review and inventory movement states change through named use cases, never generic patching of a status column.
- A transition validates current state, actor permission, scoped resources and business preconditions in one transaction.
- Retriable commands such as stock adjustment, order placement, payment callback and return receipt require a scoped idempotency key with stored outcome when persistence is implemented.
- The same key and same payload returns the original result; the same key with a different payload is a conflict.
- Payment V1 is one successful payment per order. VAT is already included in customer-facing payable prices.
- Failed shipment stock returns to the same branch warehouse with a required reason.
- Partial line returns are allowed; fixed combos are returned as a complete sellable combo.
- The current Inventory `Map` demonstrates replay semantics only within one process. It is not durable idempotency and must not be presented as safe across restarts/replicas.
