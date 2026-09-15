# Sprint 6 — Return, Refund & Flash Sale execution plan

> **Document version:** 1.2.0
>
> **Last updated:** 2026-09-15
>
> **Change summary:** Ghi rõ S6.1–S6.3 **chưa bắt đầu** và còn 4 câu hỏi treo đang chặn; S6.4 Flash Sale đã xong.

## Trạng thái tại 2026-09-15

| Hạng mục | Trạng thái | Bằng chứng |
| --- | --- | --- |
| S6.4 Flash Sale | ✅ Xong | Quota hardening + worker dọn quota + màn quản lý |
| S6.1 Return policy & request | ⛔ Chưa bắt đầu | `grep -c "model Return" prisma/schema.prisma` → `0` |
| S6.2 Receive & inspection | ⛔ Chưa bắt đầu | Chưa có bảng |
| S6.3 Refund | ⛔ Chưa bắt đầu | `grep -c "model Refund" prisma/schema.prisma` → `0` |

**Không nên bắt đầu migration S6.1 khi Q1, Q3, Q4, Q5 còn treo.** Q1 quyết luôn cấu trúc
`return_items`, Q4 quyết có cần bảng riêng cho hoàn tiền không kèm trả hàng. Chọn sai ở hai
câu này là phải migrate lại bảng đã có dữ liệu.

Hệ quả kéo theo: Dashboard **chưa báo được số lượng đơn hoàn** vì chưa có bảng nào lưu.

## 1. Mục tiêu và thứ tự

Sprint 6 không tạo đồng loạt bảng. Triển khai theo bốn wave có migration, RLS, OpenAPI, SDK và UI riêng:

1. `S6.1 Return policy/request`: eligibility, partial line return, combo nguyên bộ, evidence và review.
2. `S6.2 Receive/inspection`: nhận đúng warehouse xuất, phân loại `SELLABLE/DAMAGED`, chỉ restock quantity hợp lệ.
3. `S6.3 Refund`: amount hợp lệ, approval/execution actor, external reference và audit.
4. ~~`S6.4 Flash Sale`~~ — **ĐÃ XONG 2026-09-14.** Campaign/item/quota reservation, chống oversell bằng compare-and-set, đã nối checkout/order/cancel. Worker dọn quota quá hạn đã hoàn thành 2026-09-14 — xem `34-flash-sale-quota-expiry-runbook.md`.

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

## 5. Decision gates — ĐÃ CHỐT 2026-09-14

Ghi vào Decision Log `08-open-decisions.csv` là D54–D58.

| ID | Quyết định |
| --- | --- |
| D54 | Cửa sổ đổi trả **7 ngày** từ `DELIVERED`. Nhóm hàng loại trừ đặt bằng cờ `returnable` ở cấp **Category** để Admin tự bật/tắt, không hardcode |
| D55 | V1 **chỉ Account và Admin** tạo return. Guest gọi hotline cung cấp mã đơn và thông tin, nhân viên tạo hộ sau khi xác minh |
| D56 | Duyệt theo **vai trò**, không phải maker-checker cứng: STAFF tạo thì chờ OWNER/BRANCH_MANAGER duyệt; OWNER/BRANCH_MANAGER tạo thì duyệt luôn |
| D57 | Mặc định **chỉ hoàn giá trị item** được duyệt. Hoàn thêm phí giao ban đầu khi **lỗi thuộc về shop** — cần trường `fault: SHOP/CUSTOMER` ở bước Admin duyệt |
| D58 | Khách trả tiền mặt/COD → **hoàn tiền mặt tại cửa hàng**, có thoả thuận hai bên. Khách chuyển khoản → hoàn chuyển khoản, bắt buộc `external_ref`. Không hoàn qua cổng online khi chưa tích hợp |

### Câu hỏi nghiệp vụ còn treo — quyết sau, không chặn các wave khác

Owner đã yêu cầu **hoãn nhóm câu hỏi này để ưu tiên chức năng khác** (2026-09-14). Ghi lại nguyên văn để không mất:

| # | Câu hỏi | Trạng thái |
| --- | --- | --- |
| Q1 | **Combo cho trả hay không?** Baseline cũ ghi *"combo phải trả nguyên dòng"* (cho trả, phải trả cả bộ); Owner sau đó nói *"combo không cho trả"*. Hai cách hiểu khác nhau và quyết định luôn cấu trúc `return_items` | ⏸ Treo |
| Q2 | Danh sách nhóm hàng cụ thể bị loại trừ (găng tay, băng quấn, thảm đã bóc tem, hàng đặt riêng) | ⏸ Treo — mặc định dùng cờ `returnable` ở Category |
| Q3 | Khách gửi ảnh khi yêu cầu trả — bắt buộc hay tuỳ chọn? Shopee bắt buộc ảnh/video | ⏸ Treo |
| Q4 | Có hỗ trợ **hoàn một phần mà không cần trả hàng** không? Shopee có và dùng nhiều, tiết kiệm phí vận chuyển hai chiều | ⏸ Treo |
| Q5 | Nhân viên được tự từ chối yêu cầu trả, hay phải quản lý duyệt? | ⏸ Treo |

**Đã chốt và không đổi:** luồng ngoại lệ đi qua **thoả thuận hai bên** — khách gọi hotline, nhân viên tạo hộ yêu cầu và ghi rõ mức đã thống nhất; vì là ngoại lệ nên bắt buộc có lý do và quản lý duyệt.

**Đã chốt:** hàng trả về lưu ở **tab Hoàn** riêng trong Admin, không lẫn đơn bán; nhận hàng xong mới cập nhật tồn và chỉ với phần còn bán được.

**Tham khảo khi làm:** quy trình Shopee — người mua gửi yêu cầu kèm bằng chứng, người bán chọn *đồng ý nhận hàng* / *hoàn một phần không cần trả* / *thương lượng lại*; mục "Trả hàng/Hoàn tiền" tách riêng trong kênh người bán.

## 6. Definition of Done

- [x] Decision gate được ghi Decision Log trước migration (D54–D58).
- [ ] Migration forward-only, index/constraint/RLS/grant và workbook annotation đồng bộ.
- [ ] Return eligibility/quantity/combo ownership có unit + PostgreSQL integration.
- [ ] Receive/inspection/restock movement atomic, retry-safe và reconciliation pass.
- [ ] Refund approval/execution/amount cap có maker-checker/scope/idempotency test theo quyết định.
- [x] Flash quota concurrency không oversell; release/expire/commit không double count.
- [ ] OpenAPI và hai SDK không drift; Admin/Client có loading/empty/error/stale/permission states.
- [ ] Browser E2E Return/Refund và Flash checkout; Supabase Cron/worker evidence nếu có TTL.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.1.0 | 2026-09-14 | Đóng S6.4 Flash Sale; chốt 5 decision gate thành D54–D58. | PLAN-20260913-SPRINT6 S6.4 |
| 1.0.0 | 2026-09-13 | Tạo kế hoạch Sprint 6, schema proposal và năm decision gate trước migration. | PLAN-20260913-SPRINT6 |
