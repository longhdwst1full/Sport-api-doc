# Reservation expiry worker runbook

> **Document version:** 1.0.0  
> **Last updated:** 2026-09-08  
> **Change summary:** Hướng dẫn vận hành worker hết hạn reservation bằng Supabase Cron, pg_net và Vault.

## 1. Kiến trúc đã chọn

Supabase Cron gọi `GET /api/v1/internal/jobs/reservations/expire` mỗi 5 phút. Endpoint không xuất hiện trong OpenAPI dùng để sinh SDK FE và chỉ nhận `Authorization: Bearer <CRON_SECRET>`.

Worker xử lý tối đa `RESERVATION_EXPIRY_JOB_BATCH_SIZE` reservation mỗi lượt, claim bằng `FOR UPDATE SKIP LOCKED`, khóa balance theo thứ tự ổn định và thực hiện trong transaction `SERIALIZABLE`:

1. tìm reservation `ACTIVE` có `expires_at <= now`;
2. giảm `inventory_balances.reserved` theo đúng warehouse + sellable SKU;
3. chuyển reservation sang `EXPIRED` và checkout session sang `EXPIRED`;
4. ghi audit với actor `SYSTEM`.

Một batch lỗi sẽ rollback toàn bộ. Không sửa counter trực tiếp và không dùng timer nằm trong process Vercel vì serverless instance không sống liên tục.

## 2. Environment

Runtime API/Vercel:

```dotenv
RESERVATION_EXPIRY_JOB_ENABLED=true
RESERVATION_EXPIRY_JOB_BATCH_SIZE=50
CRON_SECRET=<random-secret-at-least-32-characters>
```

Máy dùng để cấu hình scheduler cần thêm:

```dotenv
RESERVATION_EXPIRY_JOB_URL=https://<api-domain>/api/v1/internal/jobs/reservations/expire
RESERVATION_EXPIRY_CRON_SCHEDULE=*/5 * * * *
```

`CRON_SECRET` trên Vercel và secret đưa vào Supabase Vault phải giống nhau. Không commit secret thật.

## 3. Thứ tự triển khai

1. Deploy API có endpoint worker và ba runtime env ở trên.
2. Kiểm tra `/api/v1/health` hoạt động.
3. Tại repo API chạy đúng một lần `yarn cron:reservation:set`.
4. Kiểm tra bằng `yarn cron:reservation:status`.
5. Theo dõi `cron.job_run_details`, API log theo request-id và audit action `checkout.reservation.expire`.

Lệnh `set` idempotent theo job name: cập nhật Vault secret, unschedule job cũ rồi tạo lại. Lệnh không in giá trị secret. `remove` chỉ bỏ lịch và giữ Vault secret để có thể phục hồi.

## 4. Acceptance checklist

- [x] Job endpoint không nằm trong OpenAPI FE.
- [x] Secret dùng timing-safe comparison.
- [x] Batch claim chống hai worker xử lý cùng row.
- [x] Balance/reservation/checkout/audit cùng transaction.
- [x] Unit test cho disabled, authorization, happy path và counter bất nhất.
- [ ] Deploy endpoint production trước khi tạo lịch.
- [ ] Chạy `cron:reservation:set` trên Supabase dev/prod tương ứng.
- [x] Integration test hai worker đồng thời trên PostgreSQL thật.
- [ ] Alert nếu job thất bại liên tục hoặc reservation quá hạn còn tồn đọng.

## Revision history

| Version | Date | Change summary | Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-08 | Tạo worker, secured endpoint, Supabase Cron configurator và runbook. | API-20260908-RESERVATION-EXPIRY-WORKER |

## Tài liệu nền tảng

- Supabase Cron: <https://supabase.com/docs/guides/cron>
- Gọi HTTP/Edge Function theo lịch bằng pg_cron + pg_net + Vault: <https://supabase.com/docs/guides/functions/schedule-functions>
- Vercel Cron authorization và giới hạn lịch theo plan: <https://vercel.com/docs/cron-jobs/manage-cron-jobs>
