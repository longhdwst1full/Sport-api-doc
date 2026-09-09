# Sprint 3 — Execution Status

> **Document version:** 1.8.0
> **Last updated:** 2026-09-08  
> **Change summary:** Hoàn thiện code worker hết hạn reservation, secured internal endpoint và bộ cấu hình Supabase Cron/Vault.

## 1. Trạng thái tổng quan

Sprint 3 đang thực hiện, chưa đủ điều kiện đóng Sprint. Foundation database, checkout quote, generated SDK, vòng tư vấn giao hàng và expiry worker đã hoàn thành ở mức code; kích hoạt lịch trên environment đã deploy và PostgreSQL concurrency test vẫn là blocker đóng Sprint.

**Tiến độ có trọng số: 91%.** Cách tính không coi module stub, codegen hoặc UI mock là function hoàn thành: schema/rule 20% × 100%; Backend API/domain 35% × 96%; OpenAPI/SDK 15% × 100%; Storefront/Admin UI 20% × 78%; QA/worker/provider production 10% × 72%.

| Workstream | Trạng thái | Evidence |
| --- | --- | --- |
| D01 thời điểm trừ tồn | Done | `08-open-decisions.csv` D01; `26-sprint-3-execution-plan.md` v2.2.0 |
| D02 TTL 30 phút | Done | D02; env validation 5–1440; đủ local/example/production |
| S3-D03 reservation header/items | Done | Prisma + migration `20260908010000_add_sprint3_checkout_foundation` |
| 10 bảng foundation trên Supabase dev | Done | migration tạo 10 bảng nghiệp vụ + migration bù xóa `system_settings` |
| Demand combo → component SKU | Done ở domain core | `InventoryReservationService.buildPhysicalDemand` + unit tests |
| Atomic confirm reservation | Done-code/API, cần concurrency integration | Guest/account confirm; ownership theo cart; serializable transaction, stable row lock, version guard, idempotency |
| Customer/address API | Done-code | CUS-01; ownership theo authenticated user, optimistic version, deactivate thay vì hard delete |
| Cart CRUD API | Done-code | CART-01/CART-02; guest token chỉ lưu hash, account cart, optimistic cart version |
| Shipping quote API | Done-code, provider credential pending | Free 10 km; GHN/GHTK adapters; internal rate fallback; manual consultation |
| Checkout create/requote API | Done-code, migration đã áp dụng; cần business integration | Guest/account quote; revalidate giá/cart; tự chọn branch đủ hàng; idempotency |
| Payment method selection | Done-code | BANK_TRANSFER/COD snapshot; Payment aggregate thực tế thuộc Sprint 4 |
| Atomic release command | Implemented, cần integration | ACTIVE giảm reserved; COMMITTED bị từ chối và yêu cầu movement bù trừ |
| Expiry batch worker | Done-code + PostgreSQL concurrency test; chưa kích hoạt scheduler | `FOR UPDATE SKIP LOCKED`, stable balance lock, Serializable retry, SYSTEM audit, secured internal endpoint; Supabase Cron/Vault configurator, runbook 29 và `reservation-expiry.integration-spec.ts` |
| OpenAPI + generated SDK | Done-contract/codegen | Storefront có cart/customer/shipping/checkout quote-read-confirm-release; Admin có list/update manual shipping quote SDK |
| Storefront checkout UI | Done-code, cần E2E thật | Đồng bộ local cart → server cart; quote → hiển thị branch/fee/ETA; yêu cầu tư vấn → reload quote; confirm reservation qua generated SDK |
| Admin shipping consultation UI | Done-code, cần E2E thật | Danh sách phân trang theo branch scope; dùng version từ API để chốt fee/ETA/provider/note; không nhập token/version thủ công |
| Fulfillment handover stock commit | Deferred đúng scope Sprint 4 | D01 yêu cầu SHIPPED/HANDED_OVER + reservation + movement cùng transaction |

## 2. Checklist kiểm soát đã đạt

- [x] BIGINT IDENTITY, FK, unique, CHECK và index cho 10 bảng nghiệp vụ.
- [x] Money dùng `DECIMAL(19,2)`, timestamp dùng `TIMESTAMPTZ(6)`.
- [x] Không có `deleted_at`; master dùng status.
- [x] RLS bật và `anon`/`authenticated` không được truy cập trực tiếp 10 bảng.
- [x] TTL nằm trong validated env; local/example/production cùng có giá trị 30.
- [x] `system_settings` đã bỏ khỏi Prisma/DBML/catalog và xóa bằng forward migration; không chạy seed.
- [x] Reservation sử dụng idempotency key + request hash, serializable transaction và row lock theo variant.
- [x] Combo reserve component, không reserve SKU combo ảo.
- [ ] Test hai checkout cạnh tranh SKU cuối cùng.
- [ ] Test replay cùng key và conflict khác payload trên PostgreSQL thật.
- [x] Release retry-safe; không cho release reservation đã COMMITTED.
- [x] Guest cart token raw chỉ trả một lần, backend lưu SHA-256 hash và logger redact header.
- [x] Cart mutation dùng `expectedCartVersion`; address mutation kiểm tra owner + version.
- [x] Shipping quote chọn active zone/rate theo branch, destination, weight và subtotal.
- [x] Checkout tự tính subtotal/weight/dimensions từ DB; không nhận branch, giá hoặc tồn từ FE.
- [x] Manual shipping agreement kiểm tra branch scope và audit actor/note.
- [x] Migration shipping/COD đã áp dụng trên Supabase dev; 21/21 migration up to date và constraint đã query kiểm chứng.
- [x] Confirm/release guest/account kiểm tra checkout/reservation thuộc đúng cart trước khi mutation tồn.
- [ ] Cấu hình merchant credentials/pickup location thật cho GHN/GHTK trên environment triển khai.
- [ ] PostgreSQL integration test cho idempotency, auto branch selection và checkout/manual quote race.
- [x] Audit actor phân biệt USER/GUEST từ HTTP auth/cart context khi confirm/release.
- [x] Expiry worker dùng `FOR UPDATE SKIP LOCKED`, không dùng timer trong Vercel.
- [x] Hai worker đồng thời không expire/trừ reserved trùng; raw PostgreSQL `40001` được retry có giới hạn.
- [ ] Deploy worker rồi chạy `yarn cron:reservation:set`; xác nhận lịch và recent runs trên Supabase.
- [x] API v1, OpenAPI, generated SDK và FE states cho checkout/manual consultation hoàn thành.

## 3. Quy tắc Fulfillment dành cho Sprint 4

Order accepted/payment success vẫn giữ reservation `ACTIVE`. Trong cùng transaction bàn giao hàng:

1. lock reservation và inventory balances;
2. xác nhận reservation còn `ACTIVE`, chưa hết hạn;
3. chuyển fulfillment sang `SHIPPED/HANDED_OVER`;
4. giảm `on_hand` và `reserved` đúng quantity;
5. chuyển reservation sang `COMMITTED`;
6. ghi inventory movement/history idempotent;
7. commit toàn bộ hoặc rollback toàn bộ.

Hủy trước bước bàn giao release `reserved` và refund nếu đã thu tiền. Sau bàn giao không hoàn kho ngay; hàng giao thất bại chỉ restock sau khi warehouse thực nhận và inspection.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.8.0 | 2026-09-08 | Thêm expiry worker transaction-safe, internal Bearer secret và bộ cấu hình Supabase Cron dùng Vault. | API-20260908-RESERVATION-EXPIRY-WORKER |
| 1.7.0 | 2026-09-08 | Hoàn thiện manual consultation round-trip: Admin list scoped quote, cập nhật bằng version API; Client reload rồi mới cho confirm. | API-20260908-CHECKOUT-CONSULTATION-ROUNDTRIP |
| 1.6.0 | 2026-09-08 | Phí mặc định 50k/100k/200k bằng env và Storefront checkout dùng generated SDK thay local order giả. | DBAPI-20260908-DEFAULT-SHIPPING-RATES |
| 1.5.0 | 2026-09-08 | Áp dụng migration Supabase dev, mở confirm/release API có cart ownership và sinh Checkout SDK cho Storefront/Admin. | DBAPI-20260908-CHECKOUT-SHIPPING-COD |
| 1.4.0 | 2026-09-08 | Thêm checkout quote orchestration, branch auto-selection, free 10 km, carrier adapters, manual consultation và COD snapshot. | D34 / DBAPI-20260908-CHECKOUT-SHIPPING-COD |
| 1.3.0 | 2026-09-08 | Thêm Cart, Customer Address, Shipping Quote API, contract slices và generated Client SDK. | API-20260908-SPRINT3-COMMERCE-FOUNDATION |
| 1.2.0 | 2026-09-08 | Chốt commit reservation/trừ on_hand tại SHIPPED/HANDED_OVER. | D01 / DB-20260908-INVENTORY-HANDOVER |
| 1.1.0 | 2026-09-08 | Chuyển TTL sang env, xóa system_settings và cập nhật evidence/checklist. | DB-20260908-CONFIG-ENV |
| 1.0.0 | 2026-09-08 | Tạo status/evidence/checklist sau migration foundation Sprint 3. | DB-20260908-SPRINT3-CHECKOUT |
