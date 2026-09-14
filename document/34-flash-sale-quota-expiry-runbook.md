# Runbook — Worker dọn quota Flash Sale quá hạn

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-14
>
> **Change summary:** Tạo runbook cho job trả suất flash sale về pool khi giữ chỗ hết hạn.

## Vấn đề job này giải quyết

Khách bấm mua suất flash sale rồi bỏ ngang ở bước thanh toán. Quota chỉ được trả lại khi checkout bị release tường minh, nên **suất bị giữ vô thời hạn**.

Ví dụ: chương trình 10 suất, 5 khách vào bấm rồi bỏ → chỉ còn 5 suất bán được dù chưa ai mua. Chạy vài ngày là hết sạch suất mà doanh thu bằng không.

## Cấu hình

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED` | `false` | Tắt thì endpoint trả no-op, không chạm database |
| `FLASH_SALE_QUOTA_EXPIRY_JOB_BATCH_SIZE` | `50` | Số reservation xử lý mỗi lần gọi |
| `FLASH_SALE_QUOTA_EXPIRY_JOB_URL` | — | Chỉ dùng cho `yarn cron:flash-sale:set` |
| `FLASH_SALE_QUOTA_EXPIRY_CRON_SCHEDULE` | `*/5 * * * *` | Lịch chạy |
| `CRON_SECRET` | — | Dùng chung với các worker khác, tối thiểu 32 ký tự |

TTL giữ suất (`FLASH_SALE_QUOTA_TTL_MINUTES`, mặc định 15 phút) nằm ở **bảng `system_parameters`**, sửa từ Admin không cần deploy.

## Endpoint

```
GET /api/v1/internal/jobs/flash-sales/expire-quota
Authorization: Bearer <CRON_SECRET>
```

Không nằm trong OpenAPI public (`@ApiExcludeController`). Secret so sánh constant-time.

## Lệnh vận hành

```bash
yarn cron:flash-sale:set      # tạo/cập nhật job trên Supabase Cron
yarn cron:flash-sale:status   # xem lịch và lần chạy gần nhất
yarn cron:flash-sale:remove   # gỡ job, giữ lại secret trong Vault
```

## Bất biến

1. **Chỉ đụng reservation `ACTIVE` đã quá hạn.** Suất `COMMITTED` thuộc về Order — hủy đơn mới hoàn suất, qua `revertCommittedQuota`.
2. **Không đụng `sold_quantity`.** Hết hạn nghĩa là chưa bán được, không phải hoàn bán.
3. **`SKIP LOCKED` + batch có giới hạn.** Nhiều instance chạy song song không claim trùng; chạy lặp không trả suất hai lần.
4. **Rollback khi tập đã claim không nhất quán.** Nếu `updateMany` khớp ít hơn số bản ghi đã lock — nghĩa là có reservation vừa được commit ở luồng khác — toàn bộ transaction rollback, lần chạy sau đánh giá lại. Thà bỏ lỡ một vòng còn hơn trả suất của đơn đã chốt.
5. **Gộp theo item.** Nhiều reservation cùng một suất chỉ trừ một lần trong transaction.

## Kiểm chứng ngày 2026-09-14

| Kịch bản | Kết quả |
| --- | --- |
| Gọi không kèm secret | HTTP 401 |
| Gọi sai secret | HTTP 401 |
| Job tắt | `enabled: false`, không chạm database |
| Reservation quá hạn 1 phút, giữ 3 suất | `claimed: 1, expired: 1`; reserved 3 → 0, suất còn lại 7 → 10, `sold` không đổi |
| Reservation chuyển `EXPIRED` | Kèm lý do "Hết hạn giữ suất flash sale" |
| Chạy lại lần hai | `claimed: 0, expired: 0`, reserved giữ nguyên 0 — không trừ hai lần |

Dữ liệu kiểm thử đã xoá sau khi xong.

## Khi có sự cố

**Suất không được trả về dù đã quá hạn** → kiểm tra `FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED=true` và `yarn cron:flash-sale:status` xem job có chạy không.

**`hasMore: true` liên tục** → tồn đọng lớn hơn batch size. Tăng `FLASH_SALE_QUOTA_EXPIRY_JOB_BATCH_SIZE` hoặc giảm chu kỳ cron.

**Lỗi "Tập quota đã claim không còn nhất quán"** → bình thường khi có tranh chấp; lần chạy sau tự xử lý. Lặp lại liên tục mới cần xem lại.

## Revision history

| Version | Date | Change summary | Source |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-14 | Tạo worker và runbook. | W1 — remaining-work-v1 |
