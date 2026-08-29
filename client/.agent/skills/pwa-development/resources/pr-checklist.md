# Storefront PWA review checklist

- [ ] Every affected route has an A/B/C offline contract.
- [ ] Auth, API, checkout, payment, account, order and customer data are not cached.
- [ ] Runtime cache matching is an explicit public allowlist.
- [ ] A cache-behavior change also versions `dctd-storefront-*` and preserves only this app's reset scope.
- [ ] Install/activate cleanup never deletes caches owned by another application on the same origin.
- [ ] Offline and stale-data UI is truthful.
- [ ] Mutations do not retry or queue without an approved design.
- [ ] Update confirmation, manifest, icon and `/pwa` reset work in production.
