# API feature specifications

Mỗi bounded context tạo một thư mục, ví dụ `catalog/products` hoặc `inventory/stock-adjustment`. Bắt đầu từ `../_templates/feature-spec.template.yml` và chốt actor, permission/scope, state transition, bảng đọc/ghi, transaction, idempotency, audit và OpenAPI operation trước khi code.

Feature spec sở hữu business behavior; Prisma migration sở hữu schema vật lý; OpenAPI sinh từ NestJS sở hữu HTTP contract. Không ghi rule Admin/PWA vào đây.
