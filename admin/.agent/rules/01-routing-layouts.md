# Admin routing and layouts

- Declare routes in `src/app/router/app-routes.tsx` and lazy-load every business feature.
- Keep navigation metadata in `src/app/navigation/navigation.config.tsx`; route components must not build the side menu.
- A route and its navigation item use the same stable permission code.
- `AdminLayout` owns responsive shell behavior, menu state and `Outlet`; feature pages own business content only.
- Add loading and route-error boundaries when a feature performs remote work.
- Do not put API calls, product rules or status transitions in route configuration.
