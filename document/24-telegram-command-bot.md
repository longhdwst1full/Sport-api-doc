# Telegram command bot runbook

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-05
>
> **Change summary:** Bổ sung Telegram webhook cho bộ lệnh vận hành read-only, xác thực hai lớp và hướng dẫn deploy Vercel.

## Phạm vi

Telegram bot nhận update qua webhook của API tại:

```text
POST /api/v1/integrations/telegram/webhook
```

Đây là callback machine-to-machine nên controller bị loại khỏi Swagger/OpenAPI dành cho Admin và Storefront. Endpoint không dùng JWT của người dùng; request phải có `X-Telegram-Bot-Api-Secret-Token` đúng và message phải đến từ `TELEGRAM_ALLOWED_USER_ID`.

V1 chỉ hỗ trợ các lệnh read-only:

- `/start`, `/help`: danh sách lệnh.
- `/ping`: kiểm tra bot phản hồi.
- `/health`: kiểm tra tiến trình API.
- `/status`: environment, uptime và command mode.
- `/whoami`: Telegram User ID của người gửi.

Text khác không được diễn giải thành shell command. Bot chưa có quyền sửa source, chạy migration, deploy hoặc gọi mutation nghiệp vụ.

## Biến môi trường

```env
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=<BotFather token>
TELEGRAM_ALLOWED_USER_ID=<numeric Telegram user ID>
TELEGRAM_WEBHOOK_SECRET=<random secret, minimum 32 characters>
TELEGRAM_WEBHOOK_URL=https://<api-domain>/api/v1/integrations/telegram/webhook
```

Secret thật chỉ nằm trong `.env` bị Git ignore hoặc Vercel Project Environment Variables. `VERCEL` và `VERCEL_ENV` do Vercel tự cấp.

## Deploy và đăng ký webhook

1. Deploy API có `TelegramModule`.
2. Khai báo đủ năm biến Telegram trong Vercel Production.
3. Đảm bảo deployment không bật Vercel Authentication cho webhook public.
4. Đăng ký và kiểm tra webhook:

```bash
yarn telegram:webhook:set
yarn telegram:webhook:info
```

5. Gửi `/ping` từ đúng tài khoản allowlist và nhận `pong ✅`.

Nếu đổi token hoặc webhook secret, cập nhật Vercel trước, redeploy, sau đó chạy lại `telegram:webhook:set`.

## Security notes

- Token và webhook secret không được log; logger redact header Telegram.
- User ngoài allowlist bị bỏ qua, không nhận thông tin phản hồi.
- Webhook secret dùng so sánh constant-time.
- Regenerate BotFather token ngay khi token từng xuất hiện trong chat, log hoặc source control.
- Muốn bổ sung lệnh mutation phải có allowlist lệnh, confirmation nonce hết hạn, audit actor/action/result và quyền hủy; không nối message trực tiếp vào shell.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-05 | Tạo Telegram bot webhook và runbook vận hành an toàn. | API-20260905-TELEGRAM-COMMAND-BOT |
