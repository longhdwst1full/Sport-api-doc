# Runbook — Worker dọn quota Flash Sale quá hạn

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-22
>
> **Change summary:** Cấu hình worker (bật/tắt, batch size) và TTL giữ suất chuyển sang `system_parameters`; env trở thành fallback.

## Vấn đề job này giải quyết

Khách bấm mua suất flash sale rồi bỏ ngang ở bước thanh toán. Quota chỉ được trả lại khi checkout bị release tường minh, nên **suất bị giữ vô thời hạn**.

Ví dụ: chương trình 10 suất, 5 khách vào bấm rồi bỏ → chỉ còn 5 suất bán được dù chưa ai mua. Chạy vài ngày là hết sạch suất mà doanh thu bằng không.

## Cấu hình

Giá trị **hiệu lực** đọc từ bảng `system_parameters` (nhóm `PROMOTION`), sửa từ Admin có hiệu lực
sau tối đa 30 giây (TTL cache trong tiến trình) và không cần redeploy. Biến môi trường cùng tên chỉ
là **fallback** khi tham số còn để trống hoặc `DATABASE_ENABLED=false`.

| Tham số | Nguồn | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `FLASH_SALE_QUOTA_TTL_MINUTES` | bảng | `15` | Giữ suất bao lâu trước khi worker thu hồi |
| `FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED` | bảng, fallback env | `false` | Tắt thì endpoint trả no-op, không đụng bảng quota |
| `FLASH_SALE_QUOTA_EXPIRY_JOB_BATCH_SIZE` | bảng, fallback env | `50` | Số reservation xử lý mỗi lần gọi (1..500) |
| `FLASH_SALE_QUOTA_EXPIRY_JOB_URL` | env | — | Chỉ dùng cho `yarn cron:flash-sale:set` |
| `FLASH_SALE_QUOTA_EXPIRY_CRON_SCHEDULE` | env | `*/5 * * * *` | Lịch chạy |
| `CRON_SECRET` | env | — | **Bí mật ở lại env**, tối thiểu 32 ký tự |

Vì sao bí mật không vào bảng: đưa `CRON_SECRET` vào `system_parameters` nghĩa là cho phép đổi khoá
của endpoint nội bộ qua giao diện Admin, và tự khoá mình ra ngoài khi database hỏng.

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
| Job tắt | `enabled: false`, không đụng bảng quota |
| Reservation quá hạn 1 phút, giữ 3 suất | `claimed: 1, expired: 1`; reserved 3 → 0, suất còn lại 7 → 10, `sold` không đổi |
| Reservation chuyển `EXPIRED` | Kèm lý do "Hết hạn giữ suất flash sale" |
| Chạy lại lần hai | `claimed: 0, expired: 0`, reserved giữ nguyên 0 — không trừ hai lần |

Dữ liệu kiểm thử đã xoá sau khi xong.

## Khi có sự cố

**Suất không được trả về dù đã quá hạn** → xem tham số `FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED` trong Admin (nhóm `PROMOTION`) trước, vì nó ghi đè env; rồi `yarn cron:flash-sale:status` xem job có chạy không.

**Gọi endpoint trả 401 dù đã khai secret** → tham số bật nhưng `CRON_SECRET` chưa có trong môi trường. Endpoint từ chối thay vì báo 500; khai biến rồi deploy lại.

**`hasMore: true` liên tục** → tồn đọng lớn hơn batch size. Tăng `FLASH_SALE_QUOTA_EXPIRY_JOB_BATCH_SIZE` trong Admin (có hiệu lực ngay) hoặc giảm chu kỳ cron.

**Lỗi "Tập quota đã claim không còn nhất quán"** → bình thường khi có tranh chấp; lần chạy sau tự xử lý. Lặp lại liên tục mới cần xem lại.

## Revision history

| Version | Date | Change summary | Source |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-14 | Tạo worker và runbook. | W1 — remaining-work-v1 |
| 1.1.0 | 2026-09-22 | Cấu hình worker và TTL chuyển sang `system_parameters`, env thành fallback; thiếu `CRON_SECRET` trả 401 thay vì 500. | Rà soát cấu hình worker |
