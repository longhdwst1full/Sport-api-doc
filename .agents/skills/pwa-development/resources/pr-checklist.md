# PWA review checklist

- [ ] Route declares offline contract A/B/C.
- [ ] API/auth/payment/customer data is not cached.
- [ ] Cache patterns use an explicit public allowlist.
- [ ] Offline UI is understandable and mutations are disabled or fail fast.
- [ ] Update prompt and `/pwa` reset were tested.
- [ ] Manifest and icon return 200 in production.
- [ ] Production build passes and important chunks remain reasonably sized.
