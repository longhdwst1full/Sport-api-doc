# Flash Sale — trace lỗi quota và phương án sửa

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-14
>
> **Change summary:** Bước 1–3 đã sửa xong và kiểm chứng E2E; còn Bước 4 integration test và Bước 5 contract.

## 1. Đường đi hiện tại

```
cart_items                         checkout_session_items                inventory/quota
   │                                        │                                  │
   ├─ productVariantId ───────┐             │                                  │
   │  (combo = BUNDLE variant)│             │                                  │
   │                          ▼             │                                  │
   │              resolveActiveDeals()      │                                  │
   │              orderBy salePrice ASC     │                                  │
   │              → chọn giá THẤP NHẤT      │                                  │
   │                          │             │                                  │
   │                          ▼             │                                  │
   │              snapshotItems()  ──────►  unit_price  (đã giảm)              │
   │                                        (KHÔNG lưu suất nào cho giá này)   │
   │                                        │                                  │
   │                                        ▼                                  │
   │                         buildPhysicalDemand()                             │
   │                         combo → TÁCH thành linh kiện                      │
   │                                        │                                  │
   │                                        ▼                                  │
   │                              reserveQuota()                               │
   │                              orderBy id ASC ──────────────────────────►  reserved += qty
   │                              lặp qua MỌI item khớp                        │
```

Hai nhánh dùng **hai quy tắc chọn khác nhau** và **hai tập variant khác nhau**. Đó là gốc của phần lớn lỗi bên dưới.

## 2. Bảy lỗi đã xác định

### L1 — Combo được giảm giá nhưng không trừ quota ⛔ NẶNG NHẤT

| | |
| --- | --- |
| Vị trí | `checkout.service.ts` `snapshotItems` ↔ `inventory-reservation.service.ts` `buildPhysicalDemand` |
| Cơ chế | Báo giá dùng **variant của combo**; giữ quota nhận **variant linh kiện đã tách** |
| Hậu quả | Flash sale đặt trên combo: khách **luôn được giá flash**, `reserved_quantity` **không bao giờ tăng**. Bán vượt quota không giới hạn |
| Bằng chứng | `reserveQuota` nhận `demand.map(...)` từ `buildPhysicalDemand`, hàm này tách BUNDLE thành `componentSnapshot` |

### L2 — Một SKU ở nhiều campaign thì trừ quota nhiều lần ⛔ NẶNG

| | |
| --- | --- |
| Vị trí | `flash-sale.service.ts` `reserveQuota`, vòng `for (const item of items)` |
| Cơ chế | Vòng lặp duyệt **mọi** flash item khớp variant. Hai campaign cùng bán SKU đó ⇒ trừ quota **cả hai** cho cùng một lần mua |
| Hậu quả | Khách mua 2 cái, hệ thống trừ 2 suất ở campaign A **và** 2 suất ở campaign B. Quota bốc hơi gấp đôi |
| Ràng buộc DB không chặn được | `UNIQUE(flash_sale_item_id, checkout_session_id)` chỉ chặn trùng **cùng item**, không chặn nhiều item khác nhau của cùng variant |

### L3 — Báo giá campaign A, trừ quota campaign B

| | |
| --- | --- |
| Vị trí | `resolveActiveDeals` dùng `orderBy salePrice ASC`; `reserveQuota` dùng `orderBy id ASC` |
| Hậu quả | Giá lấy từ campaign rẻ nhất, quota trừ ở campaign tạo trước. Báo cáo doanh số theo campaign sai |

### L4 — Không snapshot suất flash vào checkout

| | |
| --- | --- |
| Vị trí | Bảng `checkout_session_items` không có cột nào trỏ tới `flash_sale_items` |
| Hậu quả | Không có ràng buộc nào giữa **giá đã báo** và **suất đã giữ**. Là gốc của L2 và L3 |

### L5 — Giới hạn mỗi khách chỉ tính trong một lần đặt

| | |
| --- | --- |
| Vị trí | `reserveQuota`: `request.quantity > item.perCustomerLimit` |
| Hậu quả | Giới hạn 2 sản phẩm/khách: khách đặt **10 đơn, mỗi đơn 2 cái** thì lọt hết. Tính năng coi như không có tác dụng |
| Thiếu hạ tầng | `flash_sale_quota_reservations` **không có chỉ mục trên `customer_key`** — truy vấn cộng dồn sẽ quét toàn bảng |

### L6 — Khoảng trống giữa báo giá và xác nhận

Báo giá khoá giá vào `unit_price`; quota chỉ giữ ở bước xác nhận. Giữa hai bước suất có thể hết. Hiện xử lý bằng 409 ở bước xác nhận — **chấp nhận được**, nhưng thông báo phải nói rõ lý do thay vì lỗi chung.

### L7 — Chưa có integration test và E2E

`test/` không có file nào cho flash sale. 11 unit test hiện tại đều chạy trên mock, **chưa chứng minh được hành vi tranh chấp thật trên PostgreSQL**.

## 3. Đánh giá mô hình dữ liệu

| Bảng | Đánh giá |
| --- | --- |
| `flash_sale_items` | **Đúng.** `UNIQUE(campaign_id, product_variant_id)` cho phép một SKU nằm ở nhiều campaign — đây là thiết kế có chủ đích, nên **quy tắc chọn campaign nào phải được viết một lần và dùng chung**, không phải viết hai bản như hiện nay |
| Ràng buộc chống oversell | **Đúng và đủ.** `sold + reserved <= quota` ở tầng database đã cứu hệ thống khỏi L2 trở thành âm quota |
| `flash_sale_quota_reservations` | **Thiếu hai thứ:** chỉ mục trên `customer_key` (cho L5) và ràng buộc chặn một session giữ quota của hai item cùng variant (cho L2) |
| `checkout_session_items` | **Thiếu `flash_sale_item_id`** (cho L4) |
| Quota tách khỏi tồn kho vật lý | **Đúng.** Không gộp hai khái niệm là quyết định chính xác, giữ nguyên |

**Kết luận:** mô hình đúng hướng, không phải làm lại. Cần **một migration bổ sung** và **gom quy tắc chọn campaign về một chỗ**.

## 4. Phương án sửa

### Bước 1 — Một nguồn quyết định duy nhất *(gỡ L2, L3, L4)*

Thêm `flash_sale_item_id` vào `checkout_session_items`, nullable.

- **Báo giá:** `resolveActiveDeals` trả về suất được chọn; `snapshotItems` ghi cả `unitPrice` **và** `flashSaleItemId` của đúng suất đó.
- **Xác nhận:** `reserveQuota` **không tra lại**, chỉ đọc `flashSaleItemId` đã snapshot. Suất đó hết hoặc campaign đã kết thúc ⇒ 409 kèm thông báo rõ.
- Vòng lặp duyệt theo **dòng checkout**, không duyệt theo danh sách flash item ⇒ mỗi dòng đúng một suất.

Bổ sung `UNIQUE(checkout_session_id, product_variant_id)` trên bảng quota reservation để database chặn nốt trường hợp lọt lưới.

### Bước 2 — Combo dùng đúng variant *(gỡ L1)*

`reserveQuota` nhận **dòng checkout gốc** (`checkout.items`) thay vì demand vật lý đã tách.

| Flash sale đặt trên | Quota trừ ở |
| --- | --- |
| Variant combo | Suất của combo |
| Variant linh kiện lẻ | Suất của linh kiện, chỉ khi khách mua lẻ |

**Quy tắc chốt:** mua combo thì **không** trừ quota của linh kiện bên trong. Combo là một đơn vị bán riêng; trừ cả hai là tính hai lần.

### Bước 3 — Giới hạn cộng dồn theo khách *(gỡ L5)*

Đếm tổng `quantity` trên mọi reservation `ACTIVE` + `COMMITTED` của cùng `customer_key` và cùng `flash_sale_item_id`, cộng với lượng đang xin, so với `per_customer_limit`.

- Khách có tài khoản: `customer_key = user:<id>`
- Khách vãng lai: `customer_key = cart:<cartId>` — **chấp nhận hạn chế**: xoá cookie tạo giỏ mới thì lách được. Chống triệt để cần định danh khách vãng lai, ngoài phạm vi V1. Ghi rõ trong README.

Thêm chỉ mục `(customer_key, flash_sale_item_id, status)`.

### Bước 4 — Integration test và E2E *(gỡ L7)*

**Integration trên PostgreSQL thật:**

| Kịch bản | Kỳ vọng |
| --- | --- |
| Hai request song song giành suất cuối | Đúng một thắng, cái kia 409, `reserved` không vượt `quota` |
| Combo có flash sale | Trừ quota combo, **không** trừ quota linh kiện |
| Một SKU ở hai campaign | Trừ đúng **một** suất, đúng campaign đã báo giá |
| Giới hạn 2/khách, đặt 2 đơn mỗi đơn 2 | Đơn thứ hai bị chặn |
| Hết hạn rồi chạy worker | Trả suất, chạy lại không trả hai lần |
| Hủy đơn sau khi commit | `sold` giảm, suất về pool |

**Browser E2E:** `/flash-sale` → thêm giỏ → checkout → đặt đơn → hủy, kiểm tra quota sau từng bước.

### Bước 5 — Đồng bộ contract

`yarn openapi:generate` → `contracts:sync` → `generate:api` cho cả Admin và Client sau khi DTO đổi.

## 4b. Trạng thái thực hiện — 2026-09-14

| Bước | Trạng thái | Kết quả |
| --- | --- | --- |
| 1. Snapshot suất flash (L2, L3, L4) | ✅ Xong | `checkout_session_items.flash_sale_item_id`; báo giá ghi suất, xác nhận đọc thẳng không tra lại; `UNIQUE(checkout_session_id, product_variant_id)` trên bảng quota |
| 2. Combo dùng đúng variant (L1) | ✅ Xong | `reserveQuota` nhận `checkout.items` thay vì `demand` đã tách |
| 3. Giới hạn cộng dồn theo khách (L5) | ✅ Xong | `assertPerCustomerLimit` cộng dồn `ACTIVE + COMMITTED`, bỏ qua chính session hiện tại để retry không bị tính hai lần; chỉ mục `(customer_key, flash_sale_item_id, status)` |
| 4. Integration test + E2E (L7) | ⏳ Còn | Đã có 15 unit test; chưa có test trên PostgreSQL thật |
| 5. Contract + SDK | ⏳ Còn | DTO chưa đổi nên chưa cần regenerate; xác nhận lại trước khi đóng |

### Quyết định đã chốt: combo không trừ quota linh kiện

Mua combo chỉ trừ suất của **combo**. Không trừ suất của linh kiện bên trong.

Lý do: combo là một mặt hàng bán riêng, có quota riêng. Nếu trừ cả hai thì bán 25 combo là chương trình khuyến mãi cho linh kiện lẻ hết sạch suất dù chưa ai mua lẻ cái nào — khách vào xem thấy "hết suất" trong khi kho còn đầy.

### Kiểm chứng E2E ngày 2026-09-14

Combo "Combo tập gym tại nhà 5 kg" (gồm 2 tạ + 1 thảm), campaign quota 10, giá flash 1.500.000:

| Bước | reserved | sold | Ghi chú |
| --- | --- | --- | --- |
| Trước xác nhận | 0 | 0 | |
| Báo giá combo × 2 | 0 | 0 | `unitPrice = 1.500.000` — giá flash áp đúng |
| Xác nhận checkout | **2** | 0 | **Trước khi sửa con số này mãi là 0** |
| Đặt đơn | 0 | **2** | reserved → sold |
| Hủy đơn | 0 | 0 | suất về pool, còn lại 10 |

Quota reservation ghi đúng `product_variant_id = 3` (variant combo), không phải linh kiện.

Dữ liệu kiểm thử đã xoá.

## 5. Thứ tự và ước lượng

```
Bước 1  (migration + snapshot + reserve theo snapshot)   1 ngày
Bước 2  (combo)                                          0.5 ngày
Bước 3  (giới hạn cộng dồn)                              0.5 ngày
Bước 4  (integration + E2E)                              1 ngày
Bước 5  (contract + SDK)                                 0.5 ngày
                                                     ─────────────
                                                        3.5 ngày
```

Bước 1 phải làm trước vì Bước 2 và 3 đều dựa trên snapshot.

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Checkout đang mở dở khi deploy migration | Cột nullable; dòng cũ không có `flash_sale_item_id` thì xử như không có flash sale, giữ giá đã snapshot |
| Sửa `reserveQuota` làm hỏng luồng đặt hàng đang chạy | Integration test chạy trước khi đổi chữ ký hàm; giữ nguyên giao diện với `inventory-reservation.service` |
| Giới hạn theo khách vãng lai bị lách | Ghi rõ hạn chế, không quảng bá là chống gian lận |
| Quota âm do lỗi mới | Ràng buộc database `sold + reserved <= quota` vẫn là lưới an toàn cuối |

## Revision history

| Version | Date | Change summary | Source |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-14 | Trace 7 lỗi, đánh giá mô hình, chốt phương án 5 bước. | Flash sale hardening review |
