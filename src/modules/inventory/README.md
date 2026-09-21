# Inventory module — maintenance note

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-21
>
> **Change summary:** Ghi nhận transaction, idempotency, retry và error semantics của điều chỉnh/chuyển kho.

## Phạm vi và entrypoint

- `InventoryController`: đọc balance, movement, adjustment và ghi phiếu điều chỉnh.
- `StockTransferController`: tạo và chuyển trạng thái phiếu chuyển kho.
- `InventoryQueryService`: truy vấn server-side; không thay đổi ledger.
- `InventoryService.adjust`: command atomic ghi `stock_adjustments`, items, balance, movement và audit.
- OpenAPI chính: `createStockAdjustment`, `listInventoryBalances`, `listInventoryMovements`, `listStockAdjustments`.

Reservation checkout do module `checkout` sở hữu; trừ kho khi giao do `fulfillment` sở hữu.

## Source of truth và bất biến

- `inventory_balances` là projection đọc nhanh theo `warehouse_id + product_variant_id`.
- `inventory_movements` là ledger append-only; không update/delete để sửa lịch sử.
- Một adjustment phải ghi document, item, balance, movement và audit trong cùng transaction Serializable.
- Sau mutation luôn giữ `0 <= reserved <= on_hand`; online không được âm available.
- `Idempotency-Key` là unique command key: cùng key/cùng payload replay; cùng key/khác payload trả conflict.
- Scope warehouse được suy ra qua branch của principal; UI không phải ranh giới bảo mật.

## Concurrency và recovery

- Lock balance theo thứ tự `product_variant_id` để giảm deadlock cho lệnh nhiều SKU.
- Optimistic `version` vẫn được kiểm tra khi update balance.
- PostgreSQL serialization `P2034` hoặc raw SQLSTATE `40001` được retry tối đa 3 lần; mỗi lần đều kiểm tra idempotency trước mutation.
- Interactive transaction chờ tối đa 10 giây và chạy tối đa 30 giây. Pool/transaction timeout (`P2024`/`P2028`) trả 503 tiếng Việt để client retry với cùng key, không trả 500 mơ hồ.
- Không tự động retry các lỗi business, validation, permission hoặc unique reference.

## Permission, audit và kiểm thử

- Xem tồn cần `inventory.stock.view`; điều chỉnh cần `inventory.stock.adjust`.
- Nhân viên scope branch chỉ giảm tối đa 10 đơn vị/SKU/lệnh; GLOBAL được vượt. Mọi adjustment cần reason và audit.
- Unit test bao phủ replay, key conflict, giới hạn scope, loại phiếu, serialization retry và transient timeout mapping.
- PostgreSQL integration/E2E phải dùng DB test cô lập trước khi kiểm chứng mutation; không chạy thử ghi trên DB production.

## Checklist khi sửa

- [ ] Không sửa balance nếu không ghi movement cùng transaction.
- [ ] Giữ thứ tự lock ổn định và kiểm tra version.
- [ ] Test replay cùng payload và conflict khác payload.
- [ ] Nếu đổi contract/error semantics: regenerate OpenAPI/SDK và cập nhật trace document/workbook.
- [ ] Nếu thêm movement type: cập nhật constants, DB constraint/index nếu có, báo cáo và return/fulfillment consumers.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-21 | Tạo bản đồ bảo trì và chuẩn hoá retry/timeout cho adjustment. | API-20260921-INVENTORY-ADJUSTMENT-RESILIENCE |
