# Admin directory structure

- `src/app`: providers, router and navigation composition.
- `src/layouts`: application shells only; no feature data fetching.
- `src/features/<feature>`: page, feature components, hooks, UI mapping and feature tests.
- `src/core`: cross-feature policies such as authorization.
- `src/lib`: framework/transport adapters with no commerce decisions.
- `src/generated/api`: disposable Orval output; never hand edit.

Features may depend on `core`, `lib` and generated contracts. They must not import another feature's internal components. Promote genuinely shared UI deliberately instead of reaching across feature folders.
