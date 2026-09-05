# Tách repository và quy trình triển khai

Version: 1.2.0

Change summary: Chuyển Git root của backend vào `api/`; API và tài liệu hiện là repository độc lập thực sự.

Ngày cập nhật: 2026-09-05

## Phạm vi

Source được quản lý bằng ba repository độc lập nhưng vẫn có thể đặt cạnh nhau trong
cùng thư mục làm việc:

| Thành phần | Thư mục local | Repository | Artifact triển khai |
| --- | --- | --- | --- |
| API và tài liệu | `dctd-utc/api/` | `longhdwst1full/dctd-utc` | NestJS API |
| Admin | `dctd-utc/admin/` | `longhdwst1full/Sport-Admin` | Vite static app |
| Storefront/PWA | `dctd-utc/client/` | `longhdwst1full/Sport-Client` | Next.js app |

`api/`, `admin/` và `client/` đều có `.git`, lockfile, CI và dependency riêng. Thư mục
cha `dctd-utc/` chỉ là nơi đặt ba repository cạnh nhau và không còn là Git worktree.
Không cài package frontend ở API hoặc package backend ở frontend.

## Tooling ownership

Mỗi project tự sở hữu `_features`, `_plans`, `_prompts`, `_templates`, `.agent`,
`.agents`, `.claude`, `.cursor`, `.github` và `.gitnexus`. Không còn fallback tới
tooling ở thư mục cha.

- Admin tham khảo có chọn lọc `admin-client` và `dragonx-employer-web` cho CRUD,
  layout, foundation, state, Storybook và performance.
- Storefront tham khảo `dragon-web-v2` cho feature/widget/foundation, API boundary,
  responsive skeleton và PWA lifecycle.
- API tham khảo backend Java cho operational pattern, nhưng giữ module granularity
  phù hợp NestJS/Prisma.

GitNexus được pin trong `devDependencies` và index theo Git root riêng của từng project.

## Quyền sở hữu API contract

NestJS là nguồn duy nhất sinh OpenAPI. Repository API version hóa:

- `document/api/openapi-v1.yaml`;
- `document/api/admin/*.yaml`;
- `document/api/storefront/*.yaml`.

Admin và Client lưu snapshot contract tương ứng trong `contracts/`. Khi API thay đổi:

1. sửa DTO/controller và test tại API;
2. chạy `yarn contracts:generate` và commit YAML tại API;
3. tại FE chạy `yarn contracts:sync`;
4. chạy `yarn generate:api`; không sửa tay `src/generated/api`;
5. commit snapshot, generated SDK và phần feature sử dụng contract.

Có thể đặt `SPORT_API_CONTRACT_BASE_URL` tới raw URL của branch/release API để kiểm
tra contract chưa merge. Contract public mặc định được lấy từ nhánh `main` của
repository API.

## Quality gate theo repository

- API: `yarn verify`.
- Admin: `yarn verify` (lint, unit test, codegen, build, Storybook build).
- Client: `yarn verify` (typecheck, unit test, codegen, Next.js build).

Mỗi repository chạy `yarn install --frozen-lockfile` bằng Yarn 1.22.22 và Node.js 22.
Secret chỉ tồn tại ở biến môi trường của máy chạy/deployment; không commit `.env`.

## Release và rollback

Ba ứng dụng có version/tag và pipeline riêng. Một release FE phải ghi rõ API contract
commit/tag đã dùng. Nếu contract thay đổi không backward-compatible, API phải version
endpoint hoặc phối hợp thứ tự deploy; không ghi đè generated SDK bằng sửa tay.

Rollback từng ứng dụng bằng commit/tag gần nhất của chính repository đó. Snapshot YAML
trong FE là bằng chứng để xác định phiên bản API mà bản build đã sử dụng.

## Revision summary

| Version | Ngày | Thay đổi |
| --- | --- | --- |
| 1.2.0 | 2026-09-05 | Chuyển `.git` vào `api/`, hoàn tất ba repository độc lập. |
| 1.1.0 | 2026-09-05 | Tách project tooling/CI/GitNexus, ghi nguồn tham khảo riêng và trạng thái Git API. |
| 1.0.0 | 2026-09-05 | Tách API, Admin và Client thành ba Git repository; bổ sung contract sync, lockfile và CI độc lập. |
