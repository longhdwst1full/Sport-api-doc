# Order maintenance worker runbook

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Hướng dẫn vận hành payment-expiry và order auto-completion bằng một Supabase Cron endpoint bảo mật.

## 1. Trách nhiệm

Supabase Cron gọi `GET /api/v1/internal/jobs/orders/maintenance` mỗi 5 phút. Endpoint không xuất vào OpenAPI FE và yêu cầu `Authorization: Bearer <CRON_SECRET>`.

Một lần gọi chạy tuần tự:

1. `PaymentExpiryService`: hủy chuyển khoản `PENDING` quá hạn nếu chưa có evidence; release reservation/tồn giữ, cancel Fulfillment/Order và ghi payment transaction + audit atomically.
2. `OrderCompletionService`: complete Order đã `DELIVERED`, Payment `SUCCESS`, Fulfillment `DELIVERED` sau hold time.

Mỗi worker claim tối đa batch size bằng `FOR UPDATE SKIP LOCKED`. Timer không chạy trong process Vercel vì serverless instance không sống liên tục.

## 2. Environment

Runtime API/Vercel:

```dotenv
PAYMENT_EXPIRY_JOB_ENABLED=true
PAYMENT_EXPIRY_JOB_BATCH_SIZE=50
ORDER_COMPLETION_JOB_ENABLED=true
ORDER_COMPLETION_JOB_BATCH_SIZE=50
PAYMENT_TIMEOUT_MINUTES=30
ORDER_COMPLETION_HOLD_HOURS=72
CRON_SECRET=<random-secret-at-least-32-characters>
```

Máy cấu hình scheduler:

```dotenv
ORDER_MAINTENANCE_JOB_URL=https://<api-domain>/api/v1/internal/jobs/orders/maintenance
ORDER_MAINTENANCE_CRON_SCHEDULE=*/5 * * * *
```

Không commit hoặc in `CRON_SECRET`. Giá trị trên Vercel phải giống secret được script lưu trong Supabase Vault.

## 3. Triển khai và rollback

1. Deploy API và xác nhận `/api/v1/health` trả 200.
2. Chạy một lần `yarn cron:orders:set` từ môi trường có `DIRECT_URL` và env phía trên.
3. Kiểm tra `yarn cron:orders:status`, API log request-id và audit action `payment.expire` / `order.complete-automatically`.
4. Khi cần dừng: tắt hai flag runtime rồi chạy `yarn cron:orders:remove`. Vault secret được giữ để phục hồi.

Lệnh `set` idempotent theo job name: cập nhật Vault, unschedule lịch cũ và tạo lại đúng một lịch.

## 4. Checklist vận hành

- [x] Endpoint không nằm trong OpenAPI sinh SDK.
- [x] Bearer secret được so sánh timing-safe.
- [x] Claim batch chống hai worker xử lý cùng row.
- [x] Evidence xuất hiện trong race làm payment bị skip, không release nhầm.
- [x] Unit test cho disabled/auth/happy path/race và auto-complete.
- [ ] Cấu hình cron trên từng Supabase environment sau khi deployment tương ứng đã sẵn sàng.
- [ ] Alert nếu job lỗi liên tục hoặc có payment/order quá hạn tồn đọng.

## Revision history

| Version | Date | Change summary | Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-13 | Tạo secured worker, configurator và runbook. | DBAPI-20260913-FULFILLMENT-S43 |

## Tài liệu nền tảng

- Supabase Cron: <https://supabase.com/docs/guides/cron>
- Scheduled HTTP với pg_cron/pg_net/Vault: <https://supabase.com/docs/guides/functions/schedule-functions>
