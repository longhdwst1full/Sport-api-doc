# Sprint 6 — Return, Refund & Flash Sale execution plan

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Mở Sprint 6 theo dependency Return → Inspection/Restock → Refund, sau đó mới Flash quota.

## 1. Mục tiêu và thứ tự

Sprint 6 không tạo đồng loạt bảng. Triển khai theo bốn wave có migration, RLS, OpenAPI, SDK và UI riêng:

1. `S6.1 Return policy/request`: eligibility, partial line return, combo nguyên bộ, evidence và review.
2. `S6.2 Receive/inspection`: nhận đúng warehouse xuất, phân loại `SELLABLE/DAMAGED`, chỉ restock quantity hợp lệ.
3. `S6.3 Refund`: amount hợp lệ, approval/execution actor, external reference và audit.
4. `S6.4 Flash Sale`: campaign/item/quota reservation; tích hợp checkout sau khi flow bán thường đã ổn định.

## 2. Baseline đã chốt từ các Sprint trước

- Khách được trả một phần item/quantity của đơn; riêng combo phải trả nguyên dòng combo.
- Hàng trả về warehouse đã fulfillment; reason bắt buộc.
- Restock chỉ sau inspection và chỉ với quantity `SELLABLE`; `DAMAGED` không quay lại available.
- Refund không vượt giá trị item/shipping hợp lệ và không được đánh dấu `SUCCESS` trước khi tiền hoàn thực tế được thực hiện.
- Return/refund/history/ledger không physical delete, không dùng `deleted_at`.
- Money dùng Decimal; mutation có transaction, lock order cố định, idempotency, optimistic version, audit và RLS deny-by-default.

## 3. Physical schema proposal

### Wave Return/Refund

| Bảng | Vai trò | Invariant chính |
| --- | --- | --- |
| `return_policies` | Version chính sách theo thời gian | Version active bất biến; effective range không overlap cùng code |
| `return_requests` | Aggregate yêu cầu trả | Return number unique; ownership/scope; một active request trên cùng order theo rule chốt |
| `return_items` | Item/quantity trả | Thuộc OrderItem của cùng Order; quantity cộng dồn không vượt purchased; combo nguyên dòng |
| `return_status_history` | Append-only transition | Sequence/idempotency unique; actor/reason rõ |
| `refunds` | Aggregate hoàn tiền | Một refund/return; amount > 0; tổng SUCCESS không vượt Payment received amount |
| `refund_transactions` | Thực thi/attempt append-only | External reference/event/idempotency unique; `SUCCESS` chỉ từ execution thật |

Không lưu evidence bằng URL tự do; tái sử dụng `media_assets` qua bảng liên kết nếu V1 cần nhiều ảnh. Approval không nhét cột boolean vào Refund; nếu maker-checker được chốt thì dùng aggregate `approval_requests` riêng để tái sử dụng.

### Wave Flash Sale

| Bảng | Vai trò | Invariant chính |
| --- | --- | --- |
| `flash_sale_campaigns` | Campaign timed | end > start; lifecycle draft/scheduled/active/ended/cancelled |
| `flash_sale_items` | SKU + sale price + quota | campaign+variant unique; sold+reserved ≤ quota; sale price hợp lệ |
| `flash_sale_quota_reservations` | Giữ quota riêng tồn vật lý | TTL/idempotency/customer key; release/commit đồng bộ checkout/order |

Flash quota không thay thế physical inventory reservation. Checkout phải giành được cả quota và stock trong cùng transaction hoặc rollback cả hai.

## 4. API/UI dự kiến

| ID | Operation | Actor/scope | Consumer |
| --- | --- | --- | --- |
| RET-01 | Create/list/detail own return | Account/Guest ownership | Client order detail/account |
| RET-02 | Admin review approve/reject | `return.review`, BRANCH/GLOBAL | Admin Return queue/detail |
| RET-03 | Receive + inspect items | `return.receive`, warehouse/branch | Admin inspection form |
| REF-01 | Request/approve/execute refund | permission + maker-checker rule | Admin Refund queue/detail |
| FLS-01 | Campaign/item CRUD/lifecycle | `catalog.flash_sale.manage`, GLOBAL | Admin Flash management |
| FLS-02 | Public active flash list | Public | Client home/flash page |
| FLS-03 | Reserve/release/commit quota | Guest/Account checkout | Internal checkout workflow |

Nest DTO/controller là contract producer; sau mỗi wave: generate OpenAPI → sync/regenerate Admin/Client → ghép UI. Không sửa `src/generated/api` thủ công.

## 5. Decision gates trước migration S6.1/S6.3

Các điểm sau ảnh hưởng trực tiếp constraint, permission và state machine nên chưa tự quyết:

1. Cửa sổ đổi trả V1 tính từ `DELIVERED` là bao nhiêu ngày và có loại trừ nhóm sản phẩm nào?
2. Guest có được tự tạo return bằng `orderNo + guest token`, hay V1 chỉ Account/Admin tạo sau khi xác minh qua điện thoại?
3. Refund có bắt buộc maker-checker hai người không; vai trò nào request, approve và execute?
4. Phí giao ban đầu có được hoàn hay mặc định chỉ hoàn giá trị item được duyệt?
5. Refund COD/Bank transfer sẽ được nhân viên chuyển khoản thủ công và nhập `external_ref`, hay có thêm hoàn tiền mặt tại cửa hàng?

## 6. Definition of Done

- [ ] Decision gate được ghi Decision Log trước migration.
- [ ] Migration forward-only, index/constraint/RLS/grant và workbook annotation đồng bộ.
- [ ] Return eligibility/quantity/combo ownership có unit + PostgreSQL integration.
- [ ] Receive/inspection/restock movement atomic, retry-safe và reconciliation pass.
- [ ] Refund approval/execution/amount cap có maker-checker/scope/idempotency test theo quyết định.
- [ ] Flash quota concurrency không oversell; release/expire/commit không double count.
- [ ] OpenAPI và hai SDK không drift; Admin/Client có loading/empty/error/stale/permission states.
- [ ] Browser E2E Return/Refund và Flash checkout; Supabase Cron/worker evidence nếu có TTL.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-13 | Tạo kế hoạch Sprint 6, schema proposal và năm decision gate trước migration. | PLAN-20260913-SPRINT6 |
