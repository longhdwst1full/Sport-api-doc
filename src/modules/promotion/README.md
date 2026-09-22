# Promotion (Flash Sale) — maintenance note

> **Document version:** 1.2.0
>
> **Last updated:** 2026-09-22
>
> **Change summary:** Bổ sung mã lỗi suất flash và đường trừ suất của đơn bán tại quầy.

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

## Bán tại quầy cũng trừ suất

Đơn quầy KHÔNG có đường trừ suất riêng. Nó đi đúng đường của đơn online:

```
PosOrderService.create
  → buildCheckout        tạo CheckoutSession thật, snapshot flash_sale_item_id vào từng dòng
  → reservations.confirm  reserveQuota trong CÙNG transaction với tồn kho vật lý
  → orders.place          commitQuota: reserved → sold
```

Vì vậy `soldQuantity` phản ánh cả hai kênh, và `getPosCatalog` trả `flashPrice` +
`flashSaleAvailableQuantity` để nhân viên đọc đúng con số sẽ thu.

**Hết suất giữa lúc nhân viên đang lập đơn** (đã báo giá cho khách nhưng chưa giữ được suất):
`reserveQuota` trả 409 với mã `FLASH_SALE_QUOTA_EXHAUSTED`; `createPosOrder` dọn phiên bán vừa tạo
(`checkout_sessions → CANCELLED`, `carts → ABANDONED`) rồi trả `409 POS_FLASH_SALE_REPRICED` kèm giá
gốc của các dòng bị ảnh hưởng. Màn quầy hạ giá dòng đó về giá gốc và bắt nhân viên **xác nhận lại**.

Không tự hạ giá rồi lưu đơn: đơn sẽ lưu một con số khác con số nhân viên vừa đọc cho khách, và chỉ
lộ ra lúc in hoá đơn.

## Mã lỗi

| Mã | Khi nào | `details[].field` |
| --- | --- | --- |
| `FLASH_SALE_QUOTA_EXHAUSTED` | Hết suất giữa báo giá và giữ suất | entity id biến thể |
| `FLASH_SALE_CAMPAIGN_ENDED` | Campaign kết thúc/chưa tới giờ/suất bị gỡ | entity id biến thể |
| `FLASH_SALE_PER_CUSTOMER_LIMIT_REACHED` | Vượt `perCustomerLimit` | entity id biến thể |
| `POS_FLASH_SALE_REPRICED` | Riêng quầy: đã dọn phiên, kèm giá gốc để xác nhận lại | entity id biến thể |

Bắt theo chuỗi thông báo thay vì theo mã là cách để một lần sửa câu chữ làm hỏng cả Admin và
Storefront.

## Nguyên tắc: một nguồn quyết định duy nhất

Báo giá ghi lại **đúng suất flash đã dùng** vào `checkout_session_items.flash_sale_item_id`. Bước xác nhận **đọc thẳng từ đó**, không tra lại danh sách suất đang chạy.

Tra lại là nguyên nhân của ba lỗi đã sửa ngày 2026-09-14:

| Lỗi | Cơ chế cũ |
| --- | --- |
| Combo được giảm giá nhưng không trừ quota | Báo giá nhìn variant combo, giữ quota nhận variant linh kiện đã tách |
| Một SKU ở hai campaign thì trừ quota cả hai | Vòng lặp duyệt mọi suất khớp variant |
| Báo giá campaign A, trừ quota campaign B | Hai nhánh sắp xếp theo hai tiêu chí khác nhau |

**Combo là một đơn vị bán riêng.** Mua combo chỉ trừ suất của combo, không trừ suất của linh kiện bên trong.

## Giới hạn mỗi khách

Cộng dồn qua **mọi lần đặt** (`ACTIVE` + `COMMITTED` cùng `customer_key`), không chỉ một lần. Bỏ qua chính checkout hiện tại để retry không bị tính hai lần.

**Hạn chế đã biết:** khách vãng lai định danh bằng khoá giỏ hàng, xoá cookie và tạo giỏ mới thì lách được. Đây là hàng rào chống mua gom vô ý, **không phải chống gian lận**. Chống triệt để cần định danh khách vãng lai, ngoài phạm vi V1.

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

- **Integration test trên PostgreSQL thật** cho tranh chấp suất cuối, combo, đa campaign và giới hạn khách. 15 unit test hiện tại chạy trên mock.
- **Browser E2E** cho toàn luồng `/flash-sale` → giỏ → checkout → đơn → hủy.

## Checklist khi sửa

- [ ] Không đọc rồi ghi trên `flash_sale_items`; luôn dùng compare-and-set có `version`.
- [ ] Không bỏ ràng buộc quota ở database để "cho nhanh".
- [ ] Đổi state machine phải cập nhật cả `FLASH_SALE_CAMPAIGN_TRANSITIONS` (BE) và bản sao UX ở Admin.
- [ ] Không hiển thị đếm ngược dựa trên giờ máy khách.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-13 | Tạo module S6.4: schema, quota concurrency, admin CRUD/lifecycle, public list. | PLAN-20260913-SPRINT6 S6.4 |
