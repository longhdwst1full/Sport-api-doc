# Promotion (Flash Sale) — maintenance note

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Wave S6.4 — campaign, quota item và quota reservation.

## Phạm vi

| Trong phạm vi | Ngoài phạm vi |
| --- | --- |
| Campaign flash sale theo khung giờ, quota theo SKU | Giữ chỗ tồn kho vật lý — thuộc `inventory` |
| Giữ / trả / chốt quota cho checkout | Tính tiền phải trả — thuộc `checkout` |

## Bất biến

1. **Quota ≠ tồn kho.** Checkout phải giành được **cả** quota flash **và** inventory reservation trong cùng transaction, hoặc rollback cả hai. `reserveQuota` nhận sẵn `TransactionClient` từ checkout chính vì lý do này.
2. **Không oversell.** `sold + reserved ≤ quota` được ràng buộc ở database (`flash_sale_items_quota_not_exceeded_check`), không chỉ ở service.
3. **Giành quota bằng compare-and-set**, không đọc-rồi-ghi:
   ```ts
   updateMany({ where: { id, version, quota: { gte: sold + reserved + qty } }, ... })
   ```
   Hai request song song thì chỉ một cái khớp; cái còn lại nhận `count === 0` và bị từ chối. Đọc rồi ghi sẽ cho cả hai cùng thắng.
4. **Commit không đổi tổng.** `commitQuota` giảm `reserved` và tăng `sold` cùng lúc nên ràng buộc quota vẫn giữ.
5. **Không xóa lịch sử.** Suất đã phát sinh giao dịch chỉ chuyển `INACTIVE`, không `DELETE`.
6. **Giờ server là nguồn quyết định.** Campaign được lọc theo `startsAt`/`endsAt` ở server; `serverTime` trả kèm chỉ để client hiệu chỉnh đồng hồ đếm ngược.

## State machine campaign

```
DRAFT     → SCHEDULED | CANCELLED
SCHEDULED → ACTIVE | DRAFT | CANCELLED
ACTIVE    → ENDED | CANCELLED
ENDED / CANCELLED = terminal
```

Kích hoạt `ACTIVE` bị chặn nếu campaign chưa có suất bán nào.

## Operation

| ID | Operation | Quyền |
| --- | --- | --- |
| FLS-02 | `listPublicFlashSales` | Public |
| FLS-01 | `listAdminFlashSales`, `getAdminFlashSale` | `catalog.flash_sale.view` |
| FLS-01 | `createAdminFlashSale`, `updateAdminFlashSale`, `changeAdminFlashSaleStatus`, `upsertAdminFlashSaleItem`, `removeAdminFlashSaleItem` | `catalog.flash_sale.manage` |
| FLS-03 | `reserveQuota` / `releaseQuota` / `commitQuota` | Nội bộ, gọi từ checkout workflow |

## Vòng đời quota trong luồng mua

| Bước | Gọi ở đâu | Tác dụng lên item |
| --- | --- | --- |
| Báo giá checkout | `checkout.service.quote` → `resolveActiveDeals` | Chỉ đọc; áp giá flash vào snapshot nếu còn đủ suất |
| Xác nhận checkout | `inventory-reservation.service.confirm` → `reserveQuota` | `reserved += qty`, **cùng transaction với tồn kho vật lý** |
| Hủy/hết hạn checkout | `inventory-reservation.service.release` → `releaseQuota` | `reserved -= qty` |
| Đặt Order | `order.service.place` → `commitQuota` | `reserved -= qty`, `sold += qty` |
| Hủy Order trước khi giao | `order.service.cancel` → `revertCommittedQuota` | `sold -= qty`, suất về pool |

Giá flash áp ở bước báo giá là **preview**. Giữa báo giá và xác nhận vẫn có thể hết suất; khi đó `reserveQuota` ném 409 và toàn bộ reservation rollback — không có chuyện giữ được hàng mà mất suất hoặc ngược lại.

## Chưa làm

- `expireStaleQuota` đã viết và có test nhưng **chưa gắn worker/cron** như `reservation-expiry`. Hiện quota quá hạn chỉ được trả lại khi checkout bị release tường minh.

## Checklist khi sửa

- [ ] Không đọc rồi ghi trên `flash_sale_items`; luôn dùng compare-and-set có `version`.
- [ ] Không bỏ ràng buộc quota ở database để "cho nhanh".
- [ ] Đổi state machine phải cập nhật cả `FLASH_SALE_CAMPAIGN_TRANSITIONS` (BE) và bản sao UX ở Admin.
- [ ] Không hiển thị đếm ngược dựa trên giờ máy khách.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-13 | Tạo module S6.4: schema, quota concurrency, admin CRUD/lifecycle, public list. | PLAN-20260913-SPRINT6 S6.4 |
