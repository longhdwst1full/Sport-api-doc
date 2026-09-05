# Kiến trúc module và OpenAPI codegen V1

Version: 1.1.0

Ngày cập nhật: 2026-09-05
Phạm vi áp dụng: `api/`, `admin/`, `client/`.

## 1. Quyết định kiến trúc

Backend tiếp tục là NestJS modular monolith. Cấp ứng dụng tách `config/common/database/integrations`; nghiệp vụ nằm trong `modules`. Module nhỏ được để phẳng, module thường chỉ tạo folder theo loại file khi có nội dung thật, và domain lớn được chia nested Nest module theo capability.

```text
src/
├── config/          # app/database config + env validation
├── common/          # decorator, guard, filter, exception dùng lại
├── database/        # Prisma module/service, không chứa repository nghiệp vụ
├── integrations/    # object storage, shipping partner và adapter ngoài hệ thống
└── modules/
    ├── catalog/
    │   ├── catalog.module.ts
    │   └── products/
    │       ├── controllers/
    │       ├── dto/
    │       ├── services/
    │       └── products.module.ts
    └── <feature>/
        ├── dto/ repositories/ services/ enums/  # chỉ tạo khi có file thật
        ├── <feature>.controller.ts
        └── <feature>.module.ts
```

Luồng phụ thuộc bắt buộc:

```text
HTTP controller → feature service → repository port ← persistence adapter
                         ↓
                 cohesive business rules
```

- Controller chỉ map HTTP, permission, Swagger và DTO.
- Service được phép gom các use case liên quan chặt trong cùng feature V1; không gom nghiệp vụ khác capability.
- Khi service lớn lên, ưu tiên tách module con hoặc đúng policy/processor đang phức tạp, không mặc định tạo một class cho mỗi endpoint.
- Types/rule không phụ thuộc ORM entity; response DTO không lộ persistence entity.
- Module khác không truy cập repository nội bộ; chỉ dùng public method hẹp của service được export hoặc integration event.
- `*.module.ts` là composition root của feature; controller không inject Prisma hoặc third-party SDK trực tiếp.

Catalog/Products là nested-module mẫu. Organization và IAM tiếp tục là compact feature module; chỉ chuyển sang folder con khi số file/use case tăng. Không đổi tên hàng loạt `order` thành `orders` hoặc tạo module rỗng chỉ để khớp sơ đồ.

## 2. Nguồn tham khảo và phần kế thừa

- Java `customer-service`: chỉ kế thừa ownership theo bounded context, transaction và repository boundary; không sao chép package bốn tầng vào NestJS.
- Java `identity-service`: tham khảo role/permission, scoped assignment, version dùng cho invalidation và audit boundary; không sao chép cấu trúc file/class.
- `ducthong12/Nest_Ecommerce`: tham khảo feature module `module/controller/service`, config, Prisma, queue, filter và transaction. Không dùng kiến trúc microservice/Kafka/gRPC sớm và không để một service phình to như một số module tham khảo.
- `dragon-web-v2`: kế thừa generated SDK theo business domain, không dùng một models folder toàn hệ thống.
- `admin-client`: ưu tiên luồng list/form/RBAC và feature boundary; `dragonx-employer-web`/`dragon-web-v2` bổ sung hook-centric flow, API mapping, lazy loading và PWA.
- Nest.js Super: syllabus phù hợp với các hạng mục ecommerce cần có như PostgreSQL/Prisma, JWT/2FA, permission-based access control, media, product, cart/order, payment, caching, rate limit, Swagger và xử lý concurrent order. Đây là danh sách kiểm tra năng lực, không phải source để copy.

Không kế thừa maker-checker chứng khoán cho mọi CRUD, JPA entity/package Java, route-derived permission, one-class-per-endpoint hoặc chia microservice sớm.

## 3. Contract pipeline

NestJS decorator/DTO là nguồn phát sinh contract. Một lần chạy:

```bash
yarn workspace @dctd/api openapi:generate
```

sinh đồng thời:

- `api/openapi/openapi.json`: producer artifact để kiểm tra Swagger và diff kỹ thuật.
- `document/api/openapi-v1.yaml`: contract V1 tổng để review/version hóa.
- `document/api/admin/*.yaml`: contract Admin dẫn xuất theo exact tag.
- `document/api/storefront/*.yaml`: contract Storefront dẫn xuất theo exact tag.

Các YAML domain không chỉnh tay. Writer chọn operation theo tag và truy vết đệ quy `$ref` để chỉ giữ component được domain đó sử dụng.

```text
NestJS DTO/controllers
        ↓
OpenAPI JSON + openapi-v1.yaml
        ↓ split exact tag + reachable schemas
admin/<domain>.yaml       storefront/<domain>.yaml
        ↓ Orval                    ↓ Orval
admin generated SDK       client generated SDK
```

## 4. Generated SDK frontend

Admin (repository `Sport-Admin`, dùng snapshot `contracts/admin/*.yaml`):

```text
admin/src/generated/api/
├── organization/{organization.ts,models/}
├── iam/{iam.ts,models/}
├── catalog/{catalog.ts,models/}
├── inventory/{inventory.ts,models/}
├── content/{content.ts,models/}
├── reviews/{reviews.ts,models/}
└── system/{system.ts,models/}
```

Storefront (repository `Sport-Client`, snapshot `contracts/storefront/*.yaml`) chỉ có
`catalog`, `content`, `reviews`, `auth`. Client không sinh DTO hoặc operation Admin.

Mỗi frontend có script dọn đúng `src/generated/api` của chính nó trước khi generate. Generated code là disposable; feature chỉ import SDK/models từ domain của mình. Mapping DTO ↔ form/table đặt trong `src/features/<feature>`, không đặt trong generated hoặc transport mutator.

## 5. Quy trình thêm API mới

1. Xác định feature/bounded context và use case cần thêm.
2. Viết domain invariant, concurrency và audit consequence.
3. Thêm method service, request/response DTO cùng controller mỏng; chỉ tách policy/processor khi use case đã đủ phức tạp; giữ operationId và tag rõ ràng.
4. Thêm tag mới vào danh sách contract slice nếu đó là domain mới.
5. Chạy API lint, test, OpenAPI generate và build.
6. Review YAML domain: path, error, required/nullability và schema leakage.
7. Commit contract tại API; trong repository FE tương ứng chạy
   `yarn contracts:sync && yarn generate:api`.
8. Import generated SDK trong feature; chạy lint/test/build frontend.

## 6. Hai người sửa cùng một bản ghi

Metadata quản trị như product, branch, role và content dùng optimistic concurrency:

- Response luôn trả `version`.
- Update command bắt buộc nhận `expectedVersion` hoặc `If-Match`.
- PostgreSQL update có điều kiện `WHERE id = :id AND version = :expectedVersion` và tăng version trong cùng statement.
- Không update được dòng nào thì trả `409 CONCURRENT_MODIFICATION`; frontend tải bản mới và cho người dùng review khác biệt, không âm thầm ghi đè.

Các use case tranh chấp cao như tồn kho, đặt hàng, thanh toán và state transition phải có transaction, atomic condition/row lock phù hợp, idempotency key và integration test concurrency trên PostgreSQL. In-memory adapter hiện tại không chứng minh multi-instance/concurrency correctness.

## 7. Quy tắc migration tiếp theo

- Refactor theo từng vertical slice đang thay đổi, giữ URL/operationId/DTO để giảm blast radius.
- Ưu tiên Catalog update + optimistic locking, sau đó Inventory command, CMS publishing và Review moderation.
- Prisma foundation đã chốt ở D33; chỉ thay adapter in-memory bằng PostgreSQL sau khi quyết định schema liên quan và migration wave được duyệt.
- Không tạo `common service`, `utils` hoặc barrel dùng chung nếu ownership nghiệp vụ chưa rõ.

## 8. Revision summary

| Version | Ngày | Thay đổi |
| --- | --- | --- |
| 1.1.0 | 2026-09-05 | Cập nhật pipeline contract cho ba repository độc lập và bổ sung Storefront Auth. |
