# OpenAPI V1 contracts

Tất cả YAML trong thư mục này được sinh từ NestJS DTO/controllers bằng:

```bash
yarn workspace @dctd/api openapi:generate
```

- `openapi-v1.yaml`: contract tổng dùng để review và version hóa.
- `admin/*.yaml`: input Orval riêng cho từng domain Admin.
- `storefront/*.yaml`: input Orval riêng cho từng domain Storefront.

Không chỉnh YAML bằng tay. Sửa DTO/controller/tag/operationId trong `api/src`, regenerate, review diff rồi generate SDK frontend.
