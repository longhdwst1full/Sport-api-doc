# Telegram command bot runbook

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-05
>
> **Change summary:** Bổ sung local Codex Worker nhận task qua Telegram, bước xác nhận, sandbox, lưu trạng thái và gửi thông báo chủ động.

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

## Chế độ local Codex Worker

Worker chạy trên máy có ba repository local và Codex CLI. Chế độ này dùng Telegram long polling, vì vậy **không được chạy đồng thời với webhook Vercel**.

- `/task [api|admin|client] <yêu cầu>`: tạo task `PENDING_CONFIRMATION`, chưa thực thi.
- `/confirm <task-id>`: chuyển task sang `RUNNING` và khởi chạy Codex.
- `/cancel <task-id>`: hủy task chờ hoặc gửi `SIGTERM` cho task đang chạy.
- `/status [task-id]`: xem trạng thái và kết quả.
- `/tasks`: xem 10 task gần nhất.

Luồng thực thi:

```text
Telegram allowlisted user -> /task -> PENDING_CONFIRMATION
                                  -> /confirm -> Codex workspace-write
                                              -> result -> Telegram
```

Repo chỉ được chọn qua alias cố định, không nhận path từ message. Worker không nối message vào shell; prompt được truyền qua stdin của `codex exec`. Tiến trình con không nhận các env có tên chứa token, secret, password, database URL, Cloudinary hoặc API key.

## Biến môi trường

```env
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=<BotFather token>
TELEGRAM_ALLOWED_USER_ID=<numeric Telegram user ID>
TELEGRAM_WEBHOOK_SECRET=<random secret, minimum 32 characters>
TELEGRAM_WEBHOOK_URL=https://<api-domain>/api/v1/integrations/telegram/webhook

# Chỉ bật trên máy local chạy Codex Worker
TELEGRAM_CODEX_ENABLED=true
TELEGRAM_CODEX_WORKSPACE_ROOT=/absolute/path/to/dctd-utc
TELEGRAM_CODEX_DEFAULT_REPO=api
TELEGRAM_CODEX_TIMEOUT_MS=1800000
TELEGRAM_CODEX_STATE_FILE=.telegram-codex/state.json
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

## Chạy Codex Worker và gửi notification

```bash
# Tắt webhook và xó update cũ trước khi polling
yarn telegram:webhook:delete

# Cập nhật menu command và kiểm tra bot/Codex/repository
yarn telegram:commands:set
yarn telegram:codex:check

# Tiến trình này phải được giữ chạy trên máy local
yarn telegram:codex:start

# Gửi thông báo chủ động từ CI/script local
yarn telegram:notify -- "Build API đã hoàn thành"
```

State của worker nằm trong `.telegram-codex/state.json`, bị Git ignore và được ghi với mode `0600`. Tại một thời điểm chỉ một task được chạy.

## Security notes

- Token và webhook secret không được log; logger redact header Telegram.
- User ngoài allowlist bị bỏ qua, không nhận thông tin phản hồi.
- Webhook secret dùng so sánh constant-time.
- Regenerate BotFather token ngay khi token từng xuất hiện trong chat, log hoặc source control.
- Muốn bổ sung lệnh mutation phải có allowlist lệnh, confirmation nonce hết hạn, audit actor/action/result và quyền hủy; không nối message trực tiếp vào shell.
- `/confirm` là ranh giới phê duyệt bắt buộc; tạo `/task` không tự chạy.
- Sandbox `workspace-write` cho phép sửa repo đã chọn nhưng không cấp quyền tùy ý ra ngoài workspace.
- Worker local là tiến trình dài hạn; Vercel serverless không phù hợp để chạy polling/Codex CLI.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.1.0 | 2026-09-05 | Thêm Codex Worker hai bước, fixed repo allowlist, sandbox, state store và notification CLI. | OPS-20260905-TELEGRAM-CODEX-WORKER |
| 1.0.0 | 2026-09-05 | Tạo Telegram bot webhook và runbook vận hành an toàn. | API-20260905-TELEGRAM-COMMAND-BOT |
