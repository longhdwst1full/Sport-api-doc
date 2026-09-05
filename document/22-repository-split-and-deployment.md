# Tách repository và quy trình triển khai

Version: 1.0.0

Ngày cập nhật: 2026-09-05

## Phạm vi

Source được quản lý bằng ba repository độc lập nhưng vẫn có thể đặt cạnh nhau trong
cùng thư mục làm việc:

| Thành phần | Thư mục local | Repository | Artifact triển khai |
| --- | --- | --- | --- |
| API và tài liệu | `dctd-utc/` (`api/`, `document/`) | `longhdwst1full/dctd-utc` | NestJS API |
| Admin | `dctd-utc/admin/` | `longhdwst1full/Sport-Admin` | Vite static app |
| Storefront/PWA | `dctd-utc/client/` | `longhdwst1full/Sport-Client` | Next.js app |

Git gốc bỏ theo dõi `admin/` và `client/`; mỗi thư mục này có `.git`, lockfile,
CI, README và dependency riêng. Không cài package frontend ở repository API.

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
| 1.0.0 | 2026-09-05 | Tách API, Admin và Client thành ba Git repository; bổ sung contract sync, lockfile và CI độc lập. |
