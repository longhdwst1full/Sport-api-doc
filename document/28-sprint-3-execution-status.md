# Sprint 3 — Execution Status

> **Document version:** 1.0.0  
> **Last updated:** 2026-09-08  
> **Change summary:** Ghi nhận decision lock, schema/migration Supabase dev, typed reservation TTL và reservation transaction core đầu tiên.

## 1. Trạng thái tổng quan

Sprint 3 đang thực hiện, chưa đủ điều kiện đóng Sprint. Foundation database và rule tồn đã chốt; storefront API/SDK/UI vẫn là phần việc tiếp theo.

| Workstream | Trạng thái | Evidence |
| --- | --- | --- |
| D01 thời điểm trừ tồn | Done | `08-open-decisions.csv` D01; `26-sprint-3-execution-plan.md` v2.0.0 |
| D02 TTL 30 phút | Done | D02; migration setting; `SystemSettingService` + 6 unit tests |
| S3-D03 reservation header/items | Done | Prisma + migration `20260908010000_add_sprint3_checkout_foundation` |
| 11 bảng foundation trên Supabase dev | Done | `yarn db:migrate`; 4 integration tests pass |
| Demand combo → component SKU | Done ở domain core | `InventoryReservationService.buildPhysicalDemand` + unit tests |
| Atomic confirm reservation | Implemented, cần concurrency integration | Serializable transaction, stable row lock, version guard, idempotency |
| Customer/address API | Not started | CUS-01 |
| Cart CRUD API | Not started | CART-01/CART-02 |
| Shipping quote API | Not started | SHP-Q01 |
| Checkout create/requote API | Not started | CHK-01 |
| Atomic release command | Implemented, cần integration | ACTIVE giảm reserved; COMMITTED bị từ chối và yêu cầu movement bù trừ |
| Expiry batch worker | Not started | RSV-02 cần `FOR UPDATE SKIP LOCKED` và internal secret/scheduler |
| OpenAPI + generated Client SDK/UI | Not started | Chỉ generate sau khi HTTP contract được thêm |
| Order success stock commit | Deferred đúng scope Sprint 4 | D01 yêu cầu Order và movement cùng transaction |

## 2. Checklist kiểm soát đã đạt

- [x] BIGINT IDENTITY, FK, unique, CHECK và index cho 11 bảng.
- [x] Money dùng `DECIMAL(19,2)`, timestamp dùng `TIMESTAMPTZ(6)`.
- [x] Không có `deleted_at`; master dùng status.
- [x] RLS bật và `anon`/`authenticated` không được truy cập trực tiếp 11 bảng.
- [x] TTL nằm trong `system_settings`, private, typed, versioned; không chứa secret.
- [x] Migration seed setting bằng `ON CONFLICT DO NOTHING`; không chạy demo seed.
- [x] Reservation sử dụng idempotency key + request hash, serializable transaction và row lock theo variant.
- [x] Combo reserve component, không reserve SKU combo ảo.
- [ ] Test hai checkout cạnh tranh SKU cuối cùng.
- [ ] Test replay cùng key và conflict khác payload trên PostgreSQL thật.
- [x] Release retry-safe; không cho release reservation đã COMMITTED.
- [ ] Audit actor phân biệt CUSTOMER/GUEST sau khi chốt HTTP auth context.
- [ ] Expiry worker dùng `FOR UPDATE SKIP LOCKED`, không dùng timer trong Vercel.
- [ ] API v1, OpenAPI, generated SDK và FE states hoàn thành.

## 3. Quy tắc Order dành cho Sprint 4

Trong cùng transaction tạo Order:

1. lock reservation và inventory balances;
2. xác nhận reservation còn `ACTIVE`, chưa hết hạn;
3. tạo Order/snapshot;
4. giảm `on_hand` và `reserved` đúng quantity;
5. chuyển reservation sang `COMMITTED`;
6. ghi inventory movement idempotent;
7. commit toàn bộ hoặc rollback toàn bộ.

`SHIPPED` chỉ đổi fulfillment status. Hủy trước bước trên release `reserved`; hủy sau bước trên tạo movement hoàn kho bù trừ có reason. Hàng giao thất bại chỉ restock sau khi warehouse thực nhận và inspection.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-08 | Tạo status/evidence/checklist sau migration foundation Sprint 3. | DB-20260908-SPRINT3-CHECKOUT |
