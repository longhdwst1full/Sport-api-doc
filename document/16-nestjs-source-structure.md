# NestJS source structure V1

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-04
>
> **Change summary:** Loại bỏ Prisma URL local fallback và chuẩn hóa migration/seed dùng Supabase từ `api/.env.local`.

## Cấu trúc đã áp dụng

```text
api/
├── prisma/schema.prisma
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── config/
    │   ├── app.config.ts
    │   ├── database.config.ts
    │   └── env.validation.ts
    ├── common/
    │   ├── decorators/
    │   ├── exceptions/
    │   ├── filters/
    │   └── guards/
    ├── database/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    ├── integrations/
    │   ├── object-storage/
    │   └── shipping-partner/
    └── modules/
        ├── catalog/
        │   └── products/{controllers,dto,services}
        ├── payment/providers
        ├── shipping/providers
        └── ...
```

`src/platform` vẫn giữ bootstrap factory và OpenAPI artifact writer. Đây là composition/tooling riêng của ứng dụng, không phải `common` và không chứa nghiệp vụ.

## Quy tắc module

- Module có ít file được để phẳng để đọc nhanh.
- Khi có nhiều controller/DTO/service/repository, gom theo `controllers`, `dto`, `services`, `repositories`, `enums`.
- Domain lớn dùng nested Nest module theo capability. Hiện chỉ `catalog/products` active; chưa tạo `brands/categories/product-variants` rỗng.
- Repository Prisma thuộc module nghiệp vụ. `src/database` chỉ quản lý client connection/lifecycle.
- Third-party SDK bị cô lập sau port trong `src/integrations`; adapter chưa cấu hình phải fail closed.
- Payment/shipping provider là strategy trong module nghiệp vụ, không đặt logic đơn hàng vào integration adapter.

## Prisma foundation

- Pin `prisma` và `@prisma/client` cùng phiên bản `6.19.3` trong `@dctd/api`.
- `DATABASE_ENABLED=false` theo mặc định nên lint, unit test và OpenAPI generation không kết nối DB.
- Nest đọc `.env.local` trước `.env`. Với Supabase, `DATABASE_URL` dùng transaction-mode pooler cho runtime và `DIRECT_URL` dùng session-mode pooler cho migration.
- `prisma:validate`, `prisma:generate`, `prisma:migrate:status` và `prisma:migrate:deploy` đọc `.env.local` trước `.env`; thiếu `DATABASE_URL` hoặc `DIRECT_URL` thì fail fast, không âm thầm fallback về localhost.
- `api/.env.local.example` là template Supabase không chứa password thật; copy sang `.env.local` và thay `[YOUR-PASSWORD]` trên máy/deployment tương ứng.
- Schema hiện chưa có model. Model/migration được đưa vào theo delivery wave từ DBML, không sinh đồng loạt 74 bảng.

## Provider boundary hiện tại

- Payment có registry cho `BANK_TRANSFER` và `COD`, nhưng chưa có endpoint/order transition. COD chưa được bật cho V1 cho đến khi D34 được quyết định.
- Shipping có manual provider và partner provider boundary. Partner adapter hiện fail closed vì recipient/address/provider contract chưa được chốt.
- Media import object-storage port; adapter hiện fail closed cho đến khi D27 chọn Cloudinary/ImageKit hoặc provider khác.

Các boundary này là base code để phát triển tiếp, không được mô tả là tích hợp production hoàn chỉnh.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-04 | Chuẩn hóa Prisma CLI và workflow Supabase online, loại bỏ local URL fallback. | Supabase workflow 2026-09-04 |
