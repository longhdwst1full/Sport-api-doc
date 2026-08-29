# Admin directory structure

- `src/app`: providers, router, navigation and application-wide store composition.
- `src/layouts`: application shells only; no feature data fetching.
- `src/features/<feature>`: page, feature components, hooks, UI mapping and feature tests.
- `src/foundation`: reusable presentation/layout primitives without commerce orchestration.
- `src/core`: cross-feature policies such as authorization.
- `src/lib`: framework/transport adapters with no commerce decisions.
- `src/generated/api`: disposable Orval output; never hand edit.

Features may depend on `foundation`, `core`, `lib` and generated contracts. They must not import another feature's internal components. `src/features/shared` is limited to deliberate feature-level placeholders/composition and must not become a generic dumping ground.
