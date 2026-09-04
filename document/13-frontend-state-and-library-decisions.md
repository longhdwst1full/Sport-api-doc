# Frontend state and library decisions

> **Document version:** 1.2.0
>
> **Last updated:** 2026-09-04
>
> **Change summary:** Tách authentication khỏi permission bypass, chuyển CKEditor sang component trực tiếp có timeout fallback và chuẩn hóa trường bắt buộc/menu nghiệp vụ Admin.

## Ownership

| Concern                         | Owner                 | Rule                                                                         |
| ------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| HTTP transport                  | Axios mutator         | Base URL, credentials, AbortSignal and normalized errors only                |
| Remote/server state             | TanStack Query        | Generated OpenAPI queries/mutations remain authoritative                     |
| Cross-feature UI/workflow state | Redux Toolkit         | Serializable client-owned state only                                         |
| Async orchestration/persistence | Redux Saga            | Multi-step, cancellable or persistence workflows; no API cache duplication   |
| Complex admin forms             | React Hook Form + Yup | Validate form values and map to generated DTOs at feature boundary           |
| Admin search                    | use-debounce          | Debounce server filters; generated query cancellation handles stale requests |
| Admin reporting                 | Recharts              | Route-scoped decision-supporting charts                                      |
| Large admin lists               | react-window          | Stable row key and predictable row height                                    |
| Rich content                    | CKEditor 4 (`ckeditor4-react` 4.3.0) | Dynamic import; CDN loading/error state; HTML fallback; built-in Image dialog |

## Applied V1 examples

- Admin layout collapse state is in Redux; Saga persists the preference.
- Storefront cart is in Redux; Saga persists only product ID, name, display-price snapshot and quantity. No PII or payment data is stored, and checkout must revalidate price/stock online.
- Product creation uses React Hook Form/Yup and the generated `useCreateAdminProduct` mutation.
- Product search uses a 350 ms debounce.
- Dashboard uses Recharts and a virtualized module list.
- CKEditor 4 is lazy-loaded only inside Product/CMS forms. Phần implementation dùng trực tiếp component `CKEditor` theo base `admin-client`; skeleton chỉ tồn tại trong lúc khởi tạo. Sau 10 giây chưa sẵn sàng, form tự chuyển sang HTML textarea có thể nhập và cho phép retry, tránh treo skeleton vô hạn.
- Authentication và permission bypass là hai concern độc lập: development có thể mở permission gate nhưng người dùng vẫn phải đăng nhập và `/me` vẫn là nguồn xác thực.
- Tất cả field bắt buộc theo Yup/server contract phải truyền `required` cho Ant Design `Form.Item`; field bắt buộc có điều kiện chỉ hiển thị dấu `*` khi điều kiện phát sinh.
- Sidebar chia theo vùng nghiệp vụ (`sales`, `catalog`, `operations`, `experience`, `organization`, `system`); feature vẫn sở hữu page/form/query của chính nó.

## Performance guardrails

- Never mirror TanStack Query responses into Redux.
- Keep heavy feature libraries out of provider/root imports.
- Validate production bundles after dependency changes.
- Storefront remains server-rendered by default; introduce client boundaries only for interaction.
- API mutations are not auto-retried; payment/checkout data is never treated as offline-persistable state.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-04 | Ghi nhận quyết định tích hợp CKEditor 4 và các trạng thái fallback của editor. | Current worktree frontend update |
| 1.1.0 | 2026-09-04 | Bỏ custom Cloudinary uploader; dùng Image dialog có sẵn của CKEditor 4 theo base admin-client. | User decision 2026-09-04 |
| 1.2.0 | 2026-09-04 | Sửa auth/permission dev, CKEditor treo skeleton, dấu bắt buộc và phân vùng menu Admin. | Admin stabilization review 2026-09-04 |
