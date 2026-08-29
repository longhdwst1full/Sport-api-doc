# Ant Design and Tailwind ownership

- Use Ant Design for data tables, forms, modal/drawer interaction, notification, date input, selection and accessibility behavior.
- Use Tailwind for page layout, spacing, responsive grids and small visual utilities.
- Do not style the same property through both Ant Design tokens/props and Tailwind classes.
- When React Hook Form is used, it is the form state/validation owner; Ant Design `Form` supplies layout and controls rather than a second validation store.
- Prefer configured design tokens over ad-hoc colors and dimensions.
- Every list supports loading, empty and recoverable error states.
- Every destructive or irreversible action requires explicit confirmation and a visible result.
- Keep forms contract-driven: required fields, limits and enum values originate from generated schemas/business policy, not guesses in JSX.
- Treat CKEditor HTML as untrusted content: sanitize/validate at the API boundary and sanitize again for the eventual rendering context.
