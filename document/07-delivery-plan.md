# Kế hoạch triển khai V1

## 1. Thứ tự xây dựng theo dependency

| Wave | Mục tiêu | Module | Exit criteria |
|---|---|---|---|
| 0 | Foundation | Repo/CI, config, observability, auth skeleton, PostgreSQL migration, Redis, object storage | Dev/staging chạy migration tự động; request ID/log/health/check cơ bản |
| 1 | Organization + IAM | Branch, warehouse, user, role, permission, scope, audit | Backend deny-by-default; matrix permission và scope integration test đạt |
| 2 | Catalog + pricing + media | External media asset, brand/category/product/variant/media/price, storefront browse/search | Signed upload/finalize an toàn; SKU và price effective constraints; SEO/catalog PWA usable |
| 3 | Inventory core | Balance, ledger, adjustment, reservation + expiry worker | Reconciliation và concurrent reservation không âm/oversell |
| 4 | Cart + checkout | Guest/account cart, merge, branch fallback, shipping quote, order snapshot | Idempotent create-order; rollback toàn bộ khi một item hết hàng |
| 5 | Payment + fulfillment | Bank transfer/evidence/confirm, pick-pack-ship/deliver | Payment idempotent; ship atomic; history/outbox đủ |
| 6 | Admin operation + reports | Order queues, payment queue, low stock, completed revenue | Data scope đúng; export có permission/audit |
| 7 | V1 P1 | Flash sale, stocktake/transfer, return/refund, CMS bài viết/page, review/comment, media library và notification | Maker-checker, moderation và quota concurrency test đạt |
| 8 | Hardening/release | Security, performance, backup/restore, PWA offline shell, UAT | Load test, restore drill, OWASP checks, runbook và monitoring |

## 2. Modular monolith đề xuất

```text
apps/
  storefront-web
  admin-web
  api
packages/
  contracts
  ui
  config
api modules/
  iam organization customer catalog pricing inventory cart checkout
  order payment fulfillment shipping return content review media notification reporting platform
```

- Module sở hữu bảng của nó; module khác gọi application service/public contract, không query thẳng repository nội bộ.
- Transaction orchestration ở application layer. Domain không gọi HTTP/job trực tiếp.
- Sự kiện tích hợp đi qua outbox. Event nội bộ chỉ phát sau commit.
- Không tách microservice ở V1; tách sau khi có ranh giới tải/đội ngũ/dữ liệu rõ ràng.

## 3. API command trọng yếu

| Command | Permission | Idempotency | Transaction/audit |
|---|---|---|---|
| `POST /checkout/orders` | public authenticated checkout context | Bắt buộc | Order + reservation + payment + outbox một transaction |
| `POST /orders/{id}/cancel` | `order.cancel` + scope | Bắt buộc | State + release + history + outbox |
| `POST /payments/{id}/evidences` | owner/signed guest token | File hash | Evidence + transition; scan file async |
| `POST /payments/{id}/confirm` | `payment.confirm` + scope | Bắt buộc | Payment + reservation commit + fulfillment |
| `POST /fulfillments/{id}/ship` | `fulfillment.ship` + warehouse scope | Bắt buộc | Balance + movement + fulfillment + order history |
| `POST /stock-adjustments/{id}/post` | `inventory.stock.adjust` | Bắt buộc | Approval check + movements + balances |
| `POST /refunds` | `payment.refund.request` | Bắt buộc | Tạo approval request; chưa hoàn tiền ngay |
| `POST /approvals/{id}/approve` | `approval.decide` + target permission | Bắt buộc | Decision; execution bằng idempotent worker/service |

List API dùng cursor pagination cho order/movement/audit lớn; filter/sort phải whitelist. Update dùng `If-Match`/`version`; server trả 409 khi stale.

## 4. Test bắt buộc trước go-live

### Unit/domain

- Mọi state transition hợp lệ/không hợp lệ.
- Price precedence và time boundary.
- Shipping rate selection; return policy eligibility.
- Permission + scope resolution; maker-checker separation.

### Integration/database

- 100 request reserve cùng SKU không làm `reserved > on_hand`.
- Hai worker expire cùng reservation không double release.
- Duplicate create order/payment webhook/ship command tạo đúng một side effect.
- Một item thiếu tồn làm rollback toàn cart/order.
- Payment late đi NEED_REVIEW; không tự resurrect reservation.
- Ledger reconciliation: opening + movement delta = balance.
- Optimistic locking trên order/price/balance/approval.

### Security

- IDOR giữa customer, branch và warehouse.
- Permission deny-by-default; unknown permission/scope fail closed.
- Upload evidence MIME/size/malware/object ACL; signed URL expiration.
- Signed media upload giới hạn folder/MIME/size; finalize verify provider signature; asset còn usage không được delete.
- Rate limit login/OTP/search/checkout/evidence/webhook.
- CSRF cho cookie session; XSS trên CMS/review; SQL injection/filter abuse; SSRF URL fields.
- JWT/session rotation, revoke, secret rotation; PII/log redaction.

### Operational

- Backup và restore drill có RPO/RTO đo được.
- Kill worker giữa commit/publish: outbox vẫn phát lại đúng.
- Payment/notification provider timeout và retry/dead-letter.
- Dashboard cảnh báo reservation backlog, outbox lag, payment NEED_REVIEW, stock reconciliation mismatch.

## 5. Definition of Done cho mỗi chức năng

- Có rule/acceptance, permission + data scope, validation và error code.
- Có migration/constraint/index; rollback hoặc forward-fix plan.
- Có unit + integration test, gồm concurrency/idempotency khi liên quan.
- Có audit/security log, metric và alert phù hợp.
- Có API contract/OpenAPI và UI empty/loading/error/permission states.
- Không log secret/PII; accessibility và responsive được kiểm tra.
- Có feature flag cho thay đổi rủi ro; UAT scenario và dữ liệu test.

## 6. KPI go-live tối thiểu

- Oversell do hệ thống: 0.
- Duplicate order/payment/ship do retry: 0.
- Inventory reconciliation mismatch: 0 chưa được giải thích.
- API checkout p95 mục tiêu < 1.5 giây không tính provider bên ngoài.
- Catalog p95 < 500 ms từ cache/read model.
- Availability API 99.9% mục tiêu; backup RPO ≤ 15 phút và RTO ≤ 4 giờ (cần business xác nhận).

## 7. Việc làm ngay sau khi chốt tài liệu

1. Xác nhận file open decisions.
2. Review ERD vật lý 74 bảng; migration Wave 1–5 chỉ tạo P0 theo dependency, không tạo toàn bộ cùng lúc.
3. Viết permission seed và role matrix; test scope trước CRUD admin.
4. Dựng prototype transaction reservation → order → payment success → ship.
5. Chạy load/concurrency test prototype; chỉ sau đó phát triển UI checkout đầy đủ.
