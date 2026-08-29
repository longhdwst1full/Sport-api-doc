# Storefront PWA review checklist

- [ ] Every affected route has an A/B/C offline contract.
- [ ] Auth, API, checkout, payment, account, order and customer data are not cached.
- [ ] Runtime cache matching is an explicit public allowlist.
- [ ] Offline and stale-data UI is truthful.
- [ ] Mutations do not retry or queue without an approved design.
- [ ] Update confirmation, manifest, icon and `/pwa` reset work in production.
