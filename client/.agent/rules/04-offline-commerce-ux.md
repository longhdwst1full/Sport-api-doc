# Offline commerce UX

- Show persistent connectivity state when offline behavior affects the current page.
- Disable or fail fast for online-only mutations; do not pretend checkout, payment or stock reservation was accepted.
- Preserve entered non-sensitive form data only when storage and expiry are explicitly designed.
- Treat HTTP 4xx as final business/user outcomes, never offline retry candidates.
- Network interruption and HTTP rejection are different UI states.
- Product availability and price shown from cache must be labeled stale where purchase decisions could be affected; final validation happens online before order creation.
