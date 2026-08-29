# Quality gates

- Use Yarn only; keep `yarn.lock`, never add `package-lock.json`.
- Required handoff checks: `yarn lint`, `yarn test`, `yarn build`.
- Add tests for business transitions, validation, permissions and generated transport behavior.
- Prefer feature-level lazy loading in admin when adding heavy dependencies. Treat new bundle warnings as review items.
- Generated output and local build artifacts are not edited manually.
