# API plan: Customer identity verification (email/phone)

> **Document version:** 1.2.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Bổ sung phát hiện storefront không có endpoint đổi mật khẩu; đặt lại phương án cưỡng chế cho D-VERIFY-02.

## Scope and DoR

Hạng mục **C3** tách từ `2026-09-13-v1-remediation.md`. Mục tiêu: điền `users.email_verified_at` / `users.phone_verified_at` bằng một luồng xác minh thật, và dùng hai cột đó để chặn các thao tác nhạy cảm.

### Vì sao đây là chặn staging, không phải nice-to-have

`06-rules-and-state-machines.md` mục 0 ghi:

> *"V1 development tạo CUSTOMER `ACTIVE` ngay; `email_verified_at` và `phone_verified_at` để null. **Phải bổ sung verification trước staging/production** cho recovery và thao tác nhạy cảm."*

`03-database-v1.md` mục 4 ghi:

> *"Guest checkout luôn tạo/upsert `customers` với `user_id` null; bắt buộc normalized phone. Đăng ký sau sẽ link user vào customer cũ **sau xác minh**."*

Câu thứ hai mô tả một cơ chế chưa tồn tại. Không có xác minh thì không có "link sau xác minh".

### Hiện trạng đã kiểm chứng (2026-09-13)

| Hạng mục | Trạng thái |
|---|---|
| `users.email_verified_at` / `phone_verified_at` | Có cột, **0 lượt đọc/ghi trong `src/`** |
| Bảng lưu mã xác minh | **Không tồn tại** trong cả 75 bảng DBML lẫn `schema.prisma` |
| Provider email/SMS | **Không có**; module `notification` = 4 dòng rỗng |
| `registerCustomer` | Tạo `status: ACTIVE` ngay, audit ghi `verificationRequired: false` |
| Endpoint đổi email/phone | **Không tồn tại**. `storefront/auth.yaml` chỉ có register, login, refresh, logout, me |
| Endpoint đổi mật khẩu cho khách | **Không tồn tại**. `change-password` nằm trong `@Controller('admin/auth')`, tag `Admin Auth` — chỉ dành cho STAFF |
| Guest→account linking | **Chưa có**; account tạo `Customer` mới, không nhận lịch sử guest |
| Guest customer dedupe | Gộp theo `normalizedPhone`/`normalizedEmail` chưa xác minh — **lỗi toàn vẹn dữ liệu, không phải lỗ hổng đọc** (xem dưới) |

### Đã verify: gộp `customers` KHÔNG làm lộ đơn hàng

Quyền đọc/hủy đơn không đi qua `customer_id`:

```ts
// order.service.ts:368 — findOwnedOrder
const ownership: Prisma.OrderWhereInput = actor.type === 'GUEST'
  ? { checkoutSession: { cartId: actor.cartId } }
  : { checkoutSession: { cart: { userId: toDatabaseId(actor.userId) } } };
```

`assertPlacementOwnership` cũng chỉ so `cartId` / `cart.userId`. Guest phải giữ cart token; account phải sở hữu cart. Việc hai khách dùng chung một bản ghi `customers` vì trùng SĐT **không tạo đường đọc chéo nào**.

→ Vấn đề gộp customer là **chất lượng dữ liệu** (sổ khách hàng của Admin bị trộn), đã chuyển sang `_plans/2026-09-13-v1-remediation.md` hạng mục **C12**. Không nằm trong plan này.

### Definition of Ready

- [ ] **D-VERIFY-01** chốt: kênh xác minh V1 (email / SMS / cả hai).
- [ ] **D-VERIFY-02** chốt: phạm vi cưỡng chế (chặn gì khi chưa verified).
- [ ] **D-VERIFY-03** chốt: có link guest customer vào account sau xác minh không.
- [ ] Provider được cấp credential ở môi trường dev.

**Ba decision này chặn toàn bộ Giai đoạn 1 trở đi.** Chỉ Giai đoạn 0 làm được ngay. Việc duy nhất chạy song song mà không cần chờ là **B.1** ở Phụ lục B (gỡ thông báo lưu giả ở client).

---

## Domain rules and transitions

### Quy tắc mới

1. `email_verified_at` / `phone_verified_at` **chỉ được ghi bởi luồng xác minh**, không bao giờ set trong `registerCustomer`, seed hay admin update.
2. Xác minh là **append-only về mặt ngữ nghĩa**: đã verified rồi thì không tự động về null. (Quy tắc "đổi email/phone → reset verified" chưa áp dụng được vì chưa có endpoint đổi — xem Phụ lục B.)
3. Mã xác minh **chỉ lưu hash**, đúng pattern `auth_sessions.refresh_token_hash` và `carts.anonymous_token_hash` đang dùng.
4. Mã hết hạn, dùng một lần, có giới hạn số lần thử và số lần gửi lại.
5. Thất bại xác minh **không được tiết lộ** email/phone đó có tồn tại trong hệ thống hay không (chống user enumeration).
6. Xác minh không đổi `users.status`; `ACTIVE` vẫn là `ACTIVE`. Cưỡng chế nằm ở guard riêng, không trộn vào status.

### Không đổi

- State machine Order/Payment/Fulfillment: **không chạm**.
- `users.status` transition: không thêm trạng thái mới.
- Invariant 1–12 ở `06-rules-and-state-machines.md`: giữ nguyên.

---

## Ba decision cần chốt

### D-VERIFY-01 — Kênh xác minh V1

| Phương án | Chi phí | Ghi chú |
|---|---|---|
| (a) Chỉ email | Thấp — SMTP/transactional email rẻ, không cần nhà mạng | Nhưng `03-database-v1.md` bắt guest checkout **normalized phone**, email là optional → nhiều khách chỉ có phone |
| (b) Chỉ SMS OTP | Cao — cần hợp đồng brandname, chi phí mỗi tin | Phù hợp thực tế TMĐT Việt Nam |
| (c) Cả hai, verify ít nhất một | Cao nhất | Linh hoạt nhất |

**Đề xuất: (c) nhưng phát hành theo bậc** — Giai đoạn 2 làm email trước (rẻ, không phụ thuộc nhà mạng), bổ sung adapter SMS sau khi có brandname. Vì `registerCustomer` đã cho phép đăng ký bằng email **hoặc** phone, nếu chỉ làm email thì nhóm đăng ký bằng phone không có đường verify.

### D-VERIFY-02 — Phạm vi cưỡng chế

| Mức | Chặn gì khi chưa verified | Ảnh hưởng conversion |
|---|---|---|
| L0 | Không chặn gì, chỉ hiển thị nhắc | 0 |
| L1 | Chặn đổi mật khẩu và quên mật khẩu (hiện chỉ có `change-password` tồn tại) | Thấp |
| L2 | L1 + chặn xem/hủy Order của account | Trung bình |
| L3 | L1 + L2 + chặn đặt hàng bằng account | Cao |

**Đề xuất: L1 cho staging, đánh giá lại L2 trước production.** Doc chỉ nêu lý do "cho recovery và thao tác nhạy cảm" — đó đúng là phạm vi L1. Chặn checkout (L3) không có cơ sở trong tài liệu và đánh trực tiếp vào doanh thu.

### D-VERIFY-03 — Link guest customer sau xác minh

Hôm nay chưa có link guest→account, và như đã verify ở trên, việc gộp `customers` không tạo đường đọc chéo. Nhưng **nếu** làm link mà không xác minh, ai đăng ký bằng SĐT người khác sẽ **thừa hưởng toàn bộ lịch sử đơn** của người đó — đây mới là lỗ hổng thật, và nó chỉ xuất hiện khi tính năng link ra đời.

**Đề xuất:** chỉ link sau khi phone/email **đã verified**, và link phải là **thao tác có chủ đích của khách** (bấm "liên kết đơn hàng cũ"), không bao giờ tự động.

Đây là **tính năng mới, không phải khắc phục C3** → đã tách xuống Phụ lục A. Plan này chỉ cần D-VERIFY-03 để biết có phải chừa đường cho nó hay không.

---

## Prisma schema, migration and data compatibility

### Bảng mới: `verification_challenges`

**Chưa có trong 75 bảng đã duyệt** → phải bổ sung vào `09-v1-model.dbml` **và** `model-registry.data.ts` trong cùng task, nếu không unit test registry sẽ đỏ.

```
Table verification_challenges {
  id            bigint [pk, increment]
  user_id       bigint [not null]
  channel       varchar(16)  [not null]   // EMAIL | PHONE
  target        varchar(255) [not null]   // normalized email/phone tại lúc tạo
  code_hash     char(64)     [not null]   // SHA-256, không lưu raw
  status        varchar(24)  [not null, default: 'PENDING']
  attempts      int          [not null, default: 0]
  max_attempts  int          [not null, default: 5]
  expires_at    timestamptz  [not null]
  consumed_at   timestamptz
  request_id    varchar(100)
  created_at    timestamptz  [not null]
  indexes {
    (user_id, channel, status)
    (expires_at, status)
  }
  Note: '[P0] Chỉ lưu hash; một PENDING mỗi (user, channel) bằng partial unique; append-only sau khi consumed.'
}
```

Ràng buộc bắt buộc trong migration SQL (Prisma không diễn đạt được):

```sql
CONSTRAINT verification_challenges_channel_check
  CHECK (channel IN ('EMAIL','PHONE')),
CONSTRAINT verification_challenges_status_check
  CHECK (status IN ('PENDING','VERIFIED','EXPIRED','FAILED')),
CONSTRAINT verification_challenges_attempts_check
  CHECK (attempts >= 0 AND attempts <= max_attempts),
CONSTRAINT verification_challenges_consumed_shape_check
  CHECK ((status = 'PENDING') = (consumed_at IS NULL));

-- một challenge PENDING duy nhất mỗi (user, channel)
CREATE UNIQUE INDEX verification_challenges_active_key
  ON verification_challenges(user_id, channel) WHERE status = 'PENDING';

ALTER TABLE verification_challenges ENABLE ROW LEVEL SECURITY;
```

FK `user_id → users(id)` dùng `ON DELETE RESTRICT` theo mặc định của model V1.

Không đổi cột nào của `users`. Hai cột `email_verified_at` / `phone_verified_at` đã sẵn sàng.

---

## API V1 and OpenAPI compatibility

Endpoint mới, tag `Storefront Auth`:

| Method | Path | Idempotency | Rate limit |
|---|---|---|---|
| `POST` | `/api/v1/auth/verification/request` | Theo `(user, channel)` — PENDING còn hạn thì trả lại cùng kết quả, không sinh mã mới | Bắt buộc |
| `POST` | `/api/v1/auth/verification/confirm` | Không — mỗi lần là một attempt | Bắt buộc |
| `GET` | `/api/v1/auth/me` | Bổ sung `emailVerified` / `phoneVerified` (boolean) | — |

- `GET /me` chỉ **thêm field**, không bỏ field nào → backward compatible, nhưng vẫn phải regenerate SDK để FE đọc được.
- Response của `request` **không được** tiết lộ mã, không được nói target có tồn tại hay không.
- Hai endpoint mới **không** xuất hiện trong slice Admin.

---

## Permission, branch scope and audit

- Hai endpoint mới yêu cầu access token hợp lệ (`@RequireAuthentication`), **không** yêu cầu permission code — khách tự xác minh chính mình.
- Không thêm permission mới → **không cần** data migration `permission_version`.
- Audit bắt buộc, action mới:
  - `auth.verification.requested` — ghi `channel`, **không ghi** target đầy đủ (redact còn 4 ký tự cuối).
  - `auth.verification.confirmed`
  - `auth.verification.failed` — ghi `attempts`, dùng để phát hiện brute force.
- Log **không được** chứa mã raw, theo `03-database-v1.md` mục 7.

---

## Transaction, locking and idempotency

- `request`: một transaction — hết hạn challenge PENDING cũ → tạo challenge mới → audit. Gửi provider **ngoài transaction**, sau commit.
- `confirm`: `Serializable` — khóa challenge → so hash → tăng `attempts` hoặc set `VERIFIED` + ghi `users.*_verified_at` → audit. Dùng `withSerializationRetry` sẵn có.
- Sai mã **vẫn phải commit** phần tăng `attempts`, không rollback — nếu không sẽ đếm sai và mở đường brute force.
- Khi có outbox (hạng mục H1 của plan remediation), việc gửi mail/SMS chuyển sang ghi outbox event thay vì gọi provider sau commit.

---

## Unit, integration and HTTP test matrix

| Kịch bản | Loại | Bắt buộc |
|---|---|---|
| Mã đúng → set đúng cột theo channel | Unit | ✅ |
| Mã sai → `attempts +1`, không set verified | Integration | ✅ |
| Vượt `max_attempts` → `FAILED`, mã cũ vô hiệu | Integration | ✅ |
| Mã hết hạn → từ chối, không tiết lộ lý do chi tiết | Integration | ✅ |
| Dùng lại mã đã consumed → từ chối | Integration | ✅ |
| Hai `request` đồng thời → đúng một challenge PENDING | Concurrency | ✅ |
| Hai `confirm` đồng thời cùng mã đúng → verified một lần | Concurrency | ✅ |
| Rate limit `request` | HTTP | ✅ |
| Mã raw không xuất hiện trong log/audit | Unit | ✅ |
| Đổi email → `email_verified_at` về null | Integration | ✅ |
| Guard L1 chặn change-password khi chưa verified | HTTP | ✅ |
| Đăng ký xong `/me` trả `emailVerified: false` | HTTP | ✅ |

---

# CHECKLIST THỰC THI

> Làm **tuần tự từ trên xuống**. Mỗi giai đoạn xong mới sang giai đoạn sau. Ngày là **đề xuất**, cần owner xác nhận.

## Giai đoạn 0 — Mở khóa quyết định (13/09 → 16/09)

*Không cần code. Chặn Giai đoạn 2+.*

- [ ] 0.1 Viết 3 decision `D-VERIFY-01/02/03` vào `document/08-open-decisions.csv`, status `PROPOSED`, `blocking_wave` = 1
- [ ] 0.2 Gửi Business quyết D-VERIFY-01 (kênh) — nếu chọn có SMS, **bắt đầu thủ tục brandname ngay**, đây là đường găng dài nhất
- [ ] 0.3 Gửi Product quyết D-VERIFY-02 (mức cưỡng chế)
- [ ] 0.4 Gửi Business + Tech quyết D-VERIFY-03 (link guest)
- [ ] 0.5 Cập nhật 3 decision sang `DECIDED` kèm ngày và người quyết

## Giai đoạn 1 — Nền persistence (17/09 → 19/09)

*Cần D-VERIFY-01 đã chốt.*

- [ ] 1.1 Thêm `Table verification_challenges` vào `document/09-v1-model.dbml` (tổng 75 → 76)
- [ ] 1.2 Thêm entry tương ứng vào `src/modules/system/model-registry.data.ts`, `status: 'ACTIVE'`, phân loại P0
- [ ] 1.3 Chạy test registry → phải xanh (test này đỏ nếu 1.1 và 1.2 lệch nhau)
- [ ] 1.4 Thêm model `VerificationChallenge` vào `prisma/schema.prisma`
- [ ] 1.5 Viết migration `add_verification_challenges` — đủ 4 CHECK, partial unique index, RLS, FK Restrict
- [ ] 1.6 `yarn prisma:validate && yarn prisma:migrate:only`
- [ ] 1.7 Xác minh RLS thật sự bật: `SELECT relrowsecurity FROM pg_class WHERE relname='verification_challenges'`
- [ ] 1.8 Cập nhật `document/03-database-v1.md` mục 4 (constraint mới) + revision history
- [ ] 1.9 Thêm entry vào `document/11-model-change-log.json`
- [ ] 1.10 Cập nhật `document/04-table-catalog.csv` (75 → 76 dòng dữ liệu)

## Giai đoạn 2 — Cổng gửi (19/09 → 23/09)

*Cần D-VERIFY-01. Nếu chọn SMS, giai đoạn này phụ thuộc tiến độ brandname ở 0.2.*

- [ ] 2.1 Tạo port `NotificationSenderClient` trong `src/integrations/notification/` — theo đúng mẫu `shipping-partner` và `object-storage` hiện có
- [ ] 2.2 Viết `disabled-notification.client.ts` (no-op khi chưa cấu hình), mẫu `disabled-shipping-partner.client.ts`
- [ ] 2.3 Viết adapter provider thật
- [ ] 2.4 Thêm config namespace `src/config/notification.config.ts` + khai báo trong `env.validation.ts`
- [ ] 2.5 Cập nhật `.env.example`, `.env.local.example` — **không commit credential**
- [ ] 2.6 Unit test adapter với provider giả lập, gồm nhánh timeout và nhánh provider trả lỗi
- [ ] 2.7 Xác nhận `openapi:generate` vẫn chạy được với `DATABASE_ENABLED=false` — module mới **không được** cần DB lúc khởi tạo

## Giai đoạn 3 — Luồng xác minh (23/09 → 27/09)

- [ ] 3.1 `node .gitnexus/run.cjs impact "AuthService.registerCustomer" --direction upstream --repo .`
- [ ] 3.2 `VerificationService.request()` — hết hạn PENDING cũ, sinh mã, lưu hash, audit; gửi **ngoài** transaction
- [ ] 3.3 `VerificationService.confirm()` — `Serializable`, so hash, tăng attempts hoặc set verified, audit
- [ ] 3.4 DTO + validation, dùng lại `phone-normalization.ts` sẵn có
- [ ] 3.5 Hai endpoint controller + rate limit (Throttler đã có sẵn ở `app.module.ts`)
- [ ] 3.6 Bổ sung `emailVerified` / `phoneVerified` vào response `GET /me`
- [ ] 3.7 `registerCustomer`: đổi audit `verificationRequired: false` → `true`; **không** tự gửi mã, để FE gọi `request` (tránh gửi mã cho đăng ký hỏng)
- [ ] 3.8 Chạy đủ 12 test ở ma trận trên
- [ ] 3.9 Kiểm tra thủ công: mã raw không có trong log pino và không có trong `audit_logs`

> **Không có bước "đổi email/phone → reset verified".** Đã verify: endpoint đổi email/phone **không tồn tại** trong toàn bộ API. Quy tắc reset chỉ được viết khi tính năng đó ra đời — xem Phụ lục B.

## Giai đoạn 4 — Cưỡng chế L1 (27/09 → 29/09)

*Cần D-VERIFY-02.*

- [ ] 4.1 Decorator `@RequireVerifiedIdentity()` đặt cạnh `@RequireAuthentication` trong `src/common/decorators/`
- [ ] 4.2 Guard đọc `emailVerifiedAt`/`phoneVerifiedAt`, trả error code ổn định `IDENTITY_NOT_VERIFIED`
- [ ] 4.3 **Chưa có endpoint storefront nào để áp guard.** `change-password` thuộc `Admin Auth` (STAFF), không phải khách. Xem ghi chú bên dưới trước khi làm bước này.
- [ ] 4.4 Thêm message tiếng Việt vào `client-error-message.vi.ts`
- [ ] 4.5 Test: có token hợp lệ nhưng chưa verified → 403 với đúng error code
- [ ] 4.6 **Không** áp lên checkout/order — ngoài phạm vi L1, ghi rõ lý do trong code comment

> **Cảnh báo cho D-VERIFY-02.** Storefront hiện có đúng 5 operation: register, login, refresh, logout, me. **Không có** đổi mật khẩu, quên mật khẩu, đổi email/SĐT — tức **không có thao tác nhạy cảm nào để L1 bảo vệ**. Chọn L1 hôm nay đồng nghĩa xây guard chưa dùng được. Ba hướng, cần quyết cùng D-VERIFY-02:
>
> - **L0+** — chỉ lưu trạng thái verified và hiển thị nhắc; guard làm sau khi có endpoint nhạy cảm. Rẻ nhất, và vẫn gỡ được câu chặn staging trong `06-rules` mục 0.
> - **L1 kèm mở rộng phạm vi** — bổ sung `change-password` cho Storefront **trong plan này**, rồi guard nó. Làm cho L1 có nghĩa, nhưng phình scope.
> - **L2** — guard việc đọc/hủy Order của account. Có endpoint thật để bảo vệ ngay, nhưng ảnh hưởng khách đang dùng.
>
> Tao nghiêng **L0+ cho staging**, vì lý do gốc trong doc là "cho recovery và thao tác nhạy cảm" — mà cả hai đều chưa tồn tại trên storefront.

## Giai đoạn 5 — Contract và consumer (29/09 → 02/10)

- [ ] 5.1 `yarn openapi:generate`
- [ ] 5.2 `yarn contracts:check` → phải sạch
- [ ] 5.3 Xác nhận 2 endpoint mới chỉ nằm trong slice `storefront/auth.yaml`, **không** lọt sang `admin/`
- [ ] 5.4 Client: `yarn contracts:sync && yarn generate:api`
- [ ] 5.5 Client: màn hình nhập mã + gửi lại (có đếm ngược), đủ loading/empty/error/offline theo rule `10-reference-adoption.md`
- [ ] 5.6 Client: banner nhắc chưa xác minh ở profile
- [ ] 5.7 Client: xử lý `IDENTITY_NOT_VERIFIED` → điều hướng sang màn hình xác minh
- [ ] 5.8 Client: **không** cache response verification (rule `03-pwa-security-caching.md`, nhóm A)
- [ ] 5.9 Client: form "Cài đặt tài khoản" ở `profile-page.tsx` hiện báo lưu thành công giả — xử lý theo Phụ lục B trước khi thêm banner verified, tránh màn hình vừa báo "đã lưu" vừa báo "chưa xác minh"
- [ ] 5.10 Admin: hiện trạng thái verified ở màn hình customer (chỉ đọc, admin **không** được set tay)
- [ ] 5.11 Admin: `yarn contracts:sync && yarn generate:api` nếu contract admin đổi

## Giai đoạn 6 — Đóng gói (02/10 → 06/10)

- [ ] 6.1 `yarn lint && yarn test && yarn test:integration && yarn prisma:validate && yarn openapi:generate && yarn build`
- [ ] 6.2 Client `yarn verify`; Admin `yarn verify`
- [ ] 6.3 `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .` — không được `partial`/`truncated`
- [ ] 6.4 Cập nhật `06-rules-and-state-machines.md` mục 0: bỏ câu "V1 tạm chưa verification", tăng version
- [ ] 6.5 Cập nhật `src/modules/README.md` — module verification/notification đổi trạng thái
- [ ] 6.6 Annotate workbook theo `.agent/skills/db-api-document-traceability/SKILL.md`
- [ ] 6.7 Đánh dấu C3 = DONE trong `_plans/2026-09-13-v1-remediation.md`
- [ ] 6.8 Viết runbook `document/32-verification-runbook.md`: provider chết thì làm gì, cách xác minh thủ công có audit, cách đọc metric
- [ ] 6.9 Metric/alert: tỉ lệ gửi thất bại, tỉ lệ confirm thành công, số `FAILED` do brute force
- [ ] 6.10 Dọn job: xóa challenge `EXPIRED`/`FAILED` quá 30 ngày (theo mục retention 7 của `03-database-v1.md`)

---

# Phụ lục A — Link guest orders (tùy chọn, KHÔNG thuộc C3)

Chỉ làm nếu **D-VERIFY-03 = có**, và chỉ sau khi Giai đoạn 6 đóng. Đây là tính năng mới, không phải khắc phục.

- [ ] A.1 Endpoint `POST /auth/customers/link-guest-orders`, yêu cầu phone **đã verified**
- [ ] A.2 Chỉ link `customer` có `user_id IS NULL` và `normalized_phone` khớp đúng phone đã verified
- [ ] A.3 Transaction `Serializable`; audit `customer.guest_linked` ghi rõ customer id nguồn/đích
- [ ] A.4 Test bảo mật: verified phone A **không** link được customer của phone B
- [ ] A.5 Test: link hai lần → idempotent, không nhân đôi đơn
- [ ] A.6 Cập nhật `03-database-v1.md` mục 4 cho khớp cơ chế thật

# Phụ lục B — Đổi email/phone (chưa tồn tại, KHÔNG thuộc C3)

Đã verify: không có endpoint nào cho việc này, nhưng **client đang có form giả**:

```ts
// client/src/features/profile/profile-page.tsx:243
const handleSaveProfile = (e: React.FormEvent) => {
  e.preventDefault();
  setSaveSuccessMsg('Thông tin cá nhân đã được lưu thành công!');  // không gọi API nào
  setTimeout(() => setSaveSuccessMsg(''), 3500);
};
```

Form có input Họ tên/Email/SĐT và nút "Lưu thông tin thay đổi" báo thành công nhưng **không lưu gì**. Hai việc tách rời:

- [ ] B.1 **Làm ngay, độc lập C3:** bỏ thông báo thành công giả ở client — hoặc disable form kèm ghi chú "liên hệ CSKH để đổi", hoặc gỡ form. Không được để nút nói dối người dùng.
- [ ] B.2 **Sau C3:** thiết kế endpoint đổi email/phone. Thứ tự bắt buộc là **verification trước, đổi sau** — vì đổi email/phone xong phải verify lại giá trị mới, làm ngược sẽ thành phụ thuộc vòng. Lúc đó mới bổ sung quy tắc "đổi → set `*_verified_at` về null".
## Đường găng

```
0.2 (brandname SMS, nếu chọn) ──────────────► 2.3 ──► 3.x
0.1 → 0.3 → 0.5 ──► 1.x ──► 2.x ──► 3.x ──► 4.x ──► 5.x ──► 6.x
B.1 (độc lập, làm ngay)                            A.x (tùy chọn, sau 6.x)
```

Nếu D-VERIFY-01 chọn có SMS, **0.2 là việc dài nhất** (đăng ký brandname với nhà mạng thường tính bằng tuần, không bằng ngày) và phải khởi động ngay ngày đầu, không đợi các giai đoạn khác.

## Risks and open decisions

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Brandname SMS chậm làm trượt toàn bộ lịch | **Cao** | Bắt đầu 0.2 ngày đầu; phát hành email trước, SMS sau |
| Thêm bảng ngoài 75 bảng đã duyệt gây đỏ test registry | Trung bình | Bước 1.1–1.3 bắt buộc làm cùng lúc, đúng thứ tự |
| Cưỡng chế L1 chặn khách cũ chưa verified khỏi đổi mật khẩu | Trung bình | Luồng "xác minh rồi đổi" phải liền mạch ở 5.7 |
| Gửi mã tốn tiền, bị lạm dụng | Trung bình | Rate limit ở 3.5 + partial unique PENDING ở 1.5 |
| GitNexus MCP đang lỗi kết nối | Thấp | Dùng CLI `node .gitnexus/run.cjs` ở 3.1 và 6.3 |

Decision chờ chốt: **D-VERIFY-01, D-VERIFY-02, D-VERIFY-03**.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.2.0 | 2026-09-13 | Phát hiện storefront không có endpoint đổi mật khẩu (`change-password` là Admin Auth); cảnh báo L1 hiện không có gì để bảo vệ và bổ sung phương án L0+. | REVIEW-20260913-V1-GAP / C3 |
| 1.1.0 | 2026-09-13 | Verify quyền đọc đơn không qua `customer_id` và xác nhận không có endpoint đổi email/phone; chuyển vá gộp customer sang C12, guest-linking và đổi email/phone xuống phụ lục; đánh số lại 8 → 6 giai đoạn. | REVIEW-20260913-V1-GAP / C3 |
| 1.0.0 | 2026-09-13 | Tạo plan xác minh danh tính khách hàng; tách từ hạng mục C3 của plan remediation. | REVIEW-20260913-V1-GAP / C3 |
