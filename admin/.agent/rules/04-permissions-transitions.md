# Admin permissions and state transitions

- Permission gates control visibility and affordances only. The API is always authoritative.
- Use stable action codes such as `catalog.product.view`, `catalog.product.update` and `review.moderate`; never derive permissions from a URL string.
- Hide unavailable navigation, disable unavailable contextual actions when explanation is useful, and handle API 403 consistently.
- Orders, payments, inventory, returns, reviews and publishing use explicit action endpoints/transitions. Do not implement status changes as a generic editable select.
- High-risk actions show current state, requested action and business consequence before confirmation.
- Do not import the securities maker-checker workflow globally; approval is enabled only for modules whose business policy requires it.
