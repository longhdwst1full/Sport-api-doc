# Admin routing and layouts

- Declare routes in `src/app/router/app-routes.tsx` and lazy-load every business feature.
- Keep navigation metadata in `src/app/navigation/navigation.config.tsx`; route components must not build the side menu.
- A route and its navigation item use the same stable permission code.
- `AdminLayout` renders responsive shell behavior and `Outlet`; persisted cross-route shell state belongs to `src/app/store`.
- Add loading and route-error boundaries when a feature performs remote work.
- Do not put API calls, product rules or status transitions in route configuration.
