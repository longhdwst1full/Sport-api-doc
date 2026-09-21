# Kế hoạch Production Readiness và hoàn thiện chức năng V1

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-20
>
> **Change summary:** Lập critical path trước production, phân tích rủi ro theo dữ liệu/API/vận hành và tái cấu trúc backlog V1 thành các gate có thể kiểm chứng.

## 1. Mục tiêu và nguyên tắc

Tài liệu này chuyển danh sách việc còn lại thành kế hoạch thực thi có thứ tự. Mục tiêu không
phải là tăng số lượng màn hình, mà là bảo đảm một thay đổi không làm mất quyền quản trị,
sai tồn kho, sai hoàn tiền, hoặc tạo contract khác nhau giữa Backend, Admin và Storefront.

Nguyên tắc bắt buộc:

- Backend NestJS là nguồn OpenAPI duy nhất; Admin/Client chỉ dùng SDK generate, không sửa
  `src/generated/api` thủ công.
- Mọi thay đổi DB có migration forward-only, constraint/index/RLS/grant, test PostgreSQL và
  cập nhật workbook/model change log trong cùng task.
- Tiền, tồn kho, quyền và trạng thái đơn dùng transaction ngắn, idempotency, optimistic
  version, audit và trạng thái bất biến; không gọi dịch vụ ngoài khi đang giữ DB lock.
- DB Supabase hiện tại là môi trường phát triển dùng chung. E2E có mutation không được chạy
  trên DB này; cần Supabase project/branch hoặc database test riêng.
- Cấu hình vận hành/secret đặt trong environment; chính sách nghiệp vụ cần thay đổi khi đang
  chạy dùng `system_parameters` hiện có. Không tạo thêm bảng tham số mới.
- Không đánh dấu hoàn thành nếu chỉ có code nhưng chưa có bằng chứng môi trường tương ứng.

## 2. Baseline được kiểm chứng

| Phạm vi | Hiện trạng | Kết luận |
| --- | --- | --- |
| IAM | OWNER có thể sửa danh sách quyền; seed giữ quyền hiện hữu | Có nguy cơ tài khoản OWNER duy nhất tự mất `iam.role.manage` và không thể tự phục hồi |
| OpenAPI Storefront | `catalog.yaml`, `content.yaml`, `reviews.yaml`, `shipping.yaml` lệch producer | SDK có thể compile nhưng request/response runtime sai |
| Client quality | Unit test fetcher đã được đồng bộ và 18/18 test pass; build pass sau một lần retry `/category` quá 60 giây | Còn rủi ro build phụ thuộc API/network live |
| Địa chỉ giao hàng | Client dùng `provinces.open-api.vn`; Backend/GHN dùng bộ mã GHN | Tên đúng nhưng code có thể sai provider; báo giá/tạo vận đơn thất bại |
| `customer_addresses` | Có `province_code`, chưa có `district_code`, `ward_code` | Chỉ đổi UI không đủ; phải mở rộng schema và contract |
| Cron | Worker reservation và flash quota đã có | Chưa có bằng chứng production về lịch chạy, lần thành công cuối và cảnh báo lỗi |
| Auth | Access token Bearer; refresh token qua cookie; production có thể cross-site | Cần chống CSRF cho endpoint dùng cookie và throttle theo IP/identifier |
| VNPay | Có URL ký và IPN handler | Chưa có acceptance evidence trên sandbox cho retry, trùng IPN, sai chữ ký/số tiền |
| Return/Refund | Chưa có model Prisma | Chưa thể xử lý đúng hoàn từng item, combo và ledger hoàn kho/hoàn tiền |
| Review | Có model/list/comment nền tảng | Chưa khóa review vào order item đã hoàn tất và chưa hoàn chỉnh moderation/reply flow |
| Profile/Auth self-service | Có profile read và CRUD địa chỉ | Thiếu update profile, change/forgot/reset password |
| Notification | Có email adapter skeleton | Chưa có use case, outbox, retry/dead-letter và delivery evidence |
| PWA | Có manifest, icon, service worker và diagnostics | Chưa nghiệm thu trên HTTPS và chưa chứng minh không cache API/PII |

## 3. Thang rủi ro và critical path

| Mức | Ý nghĩa | Ví dụ trong dự án |
| --- | --- | --- |
| P0 | Có thể mất quyền quản trị, lộ dữ liệu, sai tiền/tồn hoặc chặn release | OWNER tự bỏ quyền; CSRF refresh/logout; contract checkout lệch |
| P1 | Chức năng lõi có thể lỗi khi vận hành hoặc không có khả năng phục hồi | Cron không chạy; mã GHN sai; IPN trùng; không có DB test riêng |
| P2 | Thiếu chức năng V1 nhưng chưa làm hỏng dữ liệu lõi hiện tại | Return/Refund, review submit, reset password, outbox |
| P3 | Có thể hoãn sau V1 nếu chưa có cam kết kinh doanh | Warranty đầy đủ, tích hợp hãng vận chuyển bổ sung |

Critical path:

```text
IAM/Auth hardening
        │
OpenAPI producer → sync contract → generate SDK → FE integration
        │
GHN address schema/API/UI → isolated E2E DB → checkout acceptance
        │
Cron + VNPay + PWA operational evidence
        │
Return/Refund schema → API → SDK → Admin/Client → E2E
        │
Customer engagement: review/profile/outbox/cart/CMS/report
```

Không nên xây Return/Refund trên SDK đang drift hoặc dùng DB dev chung để chạy mutation E2E.

## 4. Gate A — Chặn rủi ro production

### A1. Bảo vệ OWNER gốc — P0

**Trạng thái 2026-09-20:** code + targeted unit test đã hoàn thành; còn deploy/UAT và kiểm tra
Admin disable quyền OWNER trước khi đóng gate.

**Rủi ro:** chỉnh quyền OWNER làm tăng `permissionVersion`, token cũ bị vô hiệu đúng thiết
kế nhưng lần đăng nhập sau cũng không còn quyền sửa role. Nếu chỉ có một OWNER, hệ thống
không còn đường phục hồi từ UI.

**Phương án:**

1. OWNER luôn giữ toàn bộ `PERMISSION_CATALOG` theo mô hình một quản trị viên gốc đã chốt.
2. Khi update OWNER, Backend từ chối payload làm thiếu quyền; không tin FE để bảo vệ invariant.
3. Không cho deactivate/xóa assignment của active OWNER cuối cùng trong cùng transaction.
4. Seed chỉ bổ sung quyền hệ thống mới còn thiếu cho OWNER; không xóa quyền và không ghi đè
   cấu hình BRANCH_MANAGER/STAFF.
5. Có runbook break-glass dùng script có audit; không hướng dẫn sửa trực tiếp bảng production.

**Không chọn:** khóa toàn bộ OWNER không cho sửa, vì vẫn cần bổ sung quyền tính năng mới;
chỉ khóa tập quyền tối thiểu và invariant “còn ít nhất một OWNER hoạt động”.

**DoD:** unit + integration test cho tự bỏ quyền, xóa/deactivate OWNER cuối, hai request đồng
thời, seed lặp lại; Admin disable checkbox quyền gốc nhưng Backend vẫn là lớp quyết định.

### A2. Đồng bộ OpenAPI và SDK Storefront — P0

**Rủi ro:** FE build xanh không chứng minh đúng runtime. DTO đổi tên/nullable/status có thể
làm checkout, content hoặc review lỗi âm thầm.

**Phương án:** generate `openapi.json` từ app bootstrap ổn định → tách/sync contract theo
domain → chạy Orval → chỉ sửa adapter/hook/page do compiler báo. CI phải fail nếu regenerate
tạo diff. Bốn contract đang lệch được xử lý trước: catalog, content, reviews và shipping.

**DoD:** `openapi:check`, generate sạch, typecheck/test/build Client; không có chỉnh tay trong
generated folder; changelog contract ghi breaking/non-breaking và consumer bị ảnh hưởng.

### A3. Chuẩn hóa địa chỉ theo mã GHN — P0/P1

**Rủi ro:** hai địa danh trùng tên hoặc mã từ provider khác khiến quote/tạo vận đơn sai. Địa
chỉ cũ hiện không đủ district/ward code để tái sử dụng.

**Thiết kế khuyến nghị V1:**

- Thêm nullable `district_code`, `ward_code`, `province_name`, `code_provider` vào
  `customer_addresses`; `code_provider='GHN'` cho bản ghi mới.
- Không giả định mã GHN là mã hành chính quốc gia. Tên trường API phải thể hiện đây là code
  của provider hoặc kèm `codeProvider`.
- Migration chỉ backfill được tên/province chắc chắn; không đoán district/ward code. Địa chỉ
  cũ thiếu code được hiển thị nhưng bắt buộc người dùng chọn lại trước khi quote/dispatch GHN.
- Client gọi `/api/v1/shipping/areas/*` do Backend cung cấp; bỏ fallback tự tạo code.
- Checkout snapshot cả code, name và provider để lịch sử đơn không đổi khi master data đổi.

**DoD:** migration/RLS/index, CRUD address contract, generated SDK, selector checkout/profile,
test old-address remediation và E2E quote với mã thật của sandbox/provider adapter.

### A4. Refresh cookie, CSRF và login rate limit — P0

**Blast radius:** `cookieOptions` và `readRefreshToken` đi qua login/logout/refresh; thay đổi
sai có thể làm toàn bộ phiên đăng nhập Admin/Client mất hiệu lực.

**Phương án:** ưu tiên custom domains cùng site. Nếu tiếp tục dùng hai Vercel domain khác
site và `SameSite=None`, refresh/logout phải kiểm tra strict `Origin/Referer` allowlist và
CSRF double-submit token. Cookie luôn `HttpOnly`, `Secure`, path hẹp và rotation/reuse
detection. Login/refresh throttle theo IP **và** normalized identifier; account lock 5 lần
không thay thế rate limit vì kẻ xấu có thể cố ý khóa tài khoản người khác.

**Rollout:** thêm telemetry trước, bật enforcement trên staging, thử login/refresh/logout ở
Admin và Client, rồi mới production. Có feature flag rollback enforcement nhưng không tắt
`Secure` hoặc signature validation.

### A5. Cron có thể quan sát — P1

**Phương án:** Supabase Cron chỉ gọi endpoint nội bộ được ký/xác thực; business mutation vẫn
chạy qua NestJS để giữ transaction, audit và idempotency. Ghi job run/start/end/count/error,
cảnh báo khi quá hai chu kỳ chưa có success. Reservation và flash quota chạy riêng để một job
lỗi không chặn job kia.

**DoD:** lịch cron, secret, runbook rotate, bằng chứng expire/release đúng một lần, dashboard
last-success và alert giả lập. Không để cron SQL sửa trực tiếp balance/quota.

### A6. E2E mutation trên DB cô lập — P1

- Tạo Supabase project/branch test riêng hoặc PostgreSQL CI disposable; tuyệt đối không dùng
  shared dev/production.
- Migrate từ zero, seed deterministic theo test run, namespace dữ liệu và cleanup có kiểm tra.
- Test checkout/order/payment/inventory/return phải có assertions DB và API, không chỉ DOM.
- Secrets CI tách riêng, quyền tối thiểu, không in token/connection string vào artifact.

### A7. Dependency, VNPay và PWA — P1

**Dependency:** phân loại advisory theo reachability. Nâng patch/minor từng repo, chạy full
gate; major upgrade thành task riêng. Không dùng auto-fix cưỡng bức chỉ để số advisory về 0.

**VNPay sandbox matrix:** success/fail/cancel, return URL đến trước IPN, duplicate/reordered
IPN, sai signature, sai amount/currency, expired payment, timeout/retry và reconciliation.
IPN là nguồn xác nhận tiền; return URL chỉ phục vụ UX.

**PWA HTTPS:** kiểm tra install Android/Desktop Chrome, offline public shell, account/checkout
online-only, update/skip-waiting/reset cache. Service worker không cache API, token, profile,
cart, order hoặc dữ liệu cá nhân.

### A8. Build Storefront không phụ thuộc độ ổn định API live — P1

Build kiểm chứng ngày 2026-09-20 đã pass nhưng `/category` vượt 60 giây ở lần prerender đầu
và phải retry. Nếu API/Supabase chậm hơn khi Vercel deploy, artifact có thể fail dù source
không đổi. Cần phân loại trang nào bắt buộc SSG/ISR, đặt timeout/fallback có kiểm soát và không
gọi dữ liệu account trong build. CI cần test cả API khả dụng và API tạm lỗi để bảo đảm trang
công khai có fallback, đồng thời không biến lỗi contract thành nội dung rỗng âm thầm.

## 5. Gate B — Return/Refund V1

### 5.1 Giảm schema từ 6 xuống 5 bảng

V1 dùng `system_parameters` hiện có cho `RETURN_WINDOW_DAYS=7`; chưa cần
`return_policies`. Chỉ thêm:

| Bảng | Trách nhiệm | Invariant |
| --- | --- | --- |
| `return_requests` | Aggregate yêu cầu trả | order/customer/warehouse snapshot, status/version, reason/fault/actor |
| `return_items` | Dòng item và quantity | cùng order; tổng quantity đã duyệt không vượt đã mua |
| `return_status_history` | Lịch sử append-only | transition/idempotency/actor/reason rõ |
| `refunds` | Quyết định tổng tiền hoàn | amount dương, không vượt eligible/received amount |
| `refund_transactions` | Mỗi lần thực thi hoàn | append-only, external reference/idempotency unique |

Thêm `categories.returnable BOOLEAN NOT NULL DEFAULT true`. Không hardcode danh mục không
được trả trong service.

### 5.2 Quy tắc combo đã chốt

Combo được trả nhưng phải trả nguyên dòng combo: `return_items` tham chiếu `order_items` cha,
quantity trả phải bằng toàn bộ quantity còn có thể trả của dòng bundle. Không tạo yêu cầu trả
riêng `order_item_components`; component chỉ là snapshot phục vụ kiểm hàng. Refund tính theo
giá dòng combo, tránh cộng giá component và hoàn tiền hai lần.

### 5.3 Tồn kho và hoàn tiền

- Hàng về đúng warehouse fulfillment ban đầu.
- Chỉ sau inspection `SELLABLE` mới sinh movement `RETURN` và tăng available; `DAMAGED` lưu
  kết quả kiểm nhưng không tăng hàng bán được.
- Không sửa counter trực tiếp ngoài inventory domain.
- Refund mặc định theo item được duyệt; chỉ cộng phí giao ban đầu khi `fault=SHOP`.
- COD/cash: xác nhận hoàn tiền thực tế tại cửa hàng. Bank transfer: bắt buộc external ref.
- `SUCCESS` chỉ sau hành động hoàn thực tế, không phải khi duyệt yêu cầu.

### 5.4 Concurrency và transaction

Lock theo thứ tự ổn định: return request → order items → payment/refund → inventory balances
theo `variant_id` tăng dần. Transaction chỉ chứa đọc/ghi DB; gọi gateway/email ngoài
transaction. Retry cùng idempotency key trả kết quả cũ; payload khác cùng key bị từ chối.

**DoD:** eligibility 7 ngày, partial standard item, whole-combo, cumulative quantity,
inspection/restock, refund cap, role/branch scope, retry/concurrency và audit đều có unit +
PostgreSQL integration; sau đó OpenAPI → hai SDK → Admin tab Hoàn/Refund → Client order detail.

## 6. Gate C — Hoàn thiện chức năng V1

| Hạng mục | Phương án | Rủi ro cần khóa | Ưu tiên |
| --- | --- | --- | --- |
| Review | Chỉ account có `COMPLETED` order item được tạo; unique customer+orderItem; Admin moderation/reply | Review giả, reply sửa mất lịch sử | P2 |
| Profile/password | Update profile có version; change password revoke session; forgot/reset token hash, one-time, TTL | Account enumeration, token reuse | P2 |
| Notification/email | DB outbox trong cùng transaction; worker `FOR UPDATE SKIP LOCKED`, retry/backoff/dead-letter | Gửi trùng/mất email | P2 |
| Cart đa thiết bị | Server cart là authority khi login; merge guest→account idempotent, rule conflict rõ | Nhân đôi item/giá cũ | P2 |
| Export báo cáo | Async/stream cho dữ liệu lớn, filter/scope giống màn hình, audit download | Rò dữ liệu branch/PII, OOM | P2 |
| CMS | Draft→Published→Archived; publishAt/version/search; preview có quyền | Lộ draft, cache stale | P2 |
| Warranty | Đề xuất V1.1; nếu buộc V1, dùng orderItem eligibility + claim/history riêng | Phạm vi lớn, phụ thuộc serial/chính sách hãng | P3 |

Outbox DB phù hợp V1 hơn thêm broker mới: dễ giữ atomic với nghiệp vụ và vận hành trên stack
hiện có. Supabase Queue có thể cân nhắc khi lưu lượng/retry yêu cầu tách worker rõ hơn, không
nên thêm chỉ vì “có sẵn”.

## 7. Kế hoạch thực thi và ước lượng

| Wave | Phạm vi | Ước lượng một senior full-time | Gate thoát |
| --- | --- | --- | --- |
| R0 | OWNER, OpenAPI drift, build reliability; test Client đã sửa | 3–5 ngày | CI contract + auth/IAM test xanh |
| R1 | GHN address end-to-end, auth hardening, isolated E2E | 5–8 ngày | Checkout E2E trên DB test riêng |
| R2 | Cron, dependency, VNPay sandbox, PWA HTTPS | 3–5 ngày, không tính chờ key | Operational evidence đủ |
| R3 | Return/inspection/refund full stack | 8–12 ngày | API/SDK/Admin/Client/E2E và reconciliation |
| R4 | Review, profile/password, outbox/email | 7–10 ngày | Use case + retry/security tests |
| R5 | Cart sync, export, CMS | 5–8 ngày | UAT + scope/permission tests |

Tổng dự kiến **31–48 ngày công** cho một senior nếu làm tuần tự. Có thể song song FE sau khi
contract từng wave freeze; không song song migration và DTO cho cùng aggregate. Warranty nếu
đưa vào V1 cần estimate riêng sau khi chốt serial/chính sách bảo hành.

## 8. Thứ tự checklist bắt buộc

### Trước mọi migration

- [ ] Decision và invariant đã ghi tài liệu.
- [ ] Bảng/column hiện hữu đã đối chiếu; không tạo trùng responsibility.
- [ ] PK/FK/unique/check/index/on-delete/RLS/grant được thiết kế cùng migration.
- [ ] Lock order, idempotency và rollback/forward plan rõ.
- [ ] Workbook và model change log có change ID.

### Trước merge từng wave

- [ ] Backend lint/typecheck/unit/integration/migration-from-zero.
- [ ] OpenAPI generate + drift check.
- [ ] Admin/Client regenerate, lint/typecheck/test/build.
- [ ] Permission/branch/ownership/negative-path test.
- [ ] Không secret, không seed production, không log token/PII.
- [ ] Tài liệu feature/runbook/status tăng version và có summary.

### Trước production

- [ ] OWNER recovery test và break-glass runbook.
- [ ] Auth/CSRF/rate-limit staging acceptance.
- [ ] Cron last-success + alert evidence.
- [ ] VNPay sandbox matrix pass.
- [ ] PWA HTTPS acceptance pass.
- [ ] E2E mutation pass trên DB cô lập.
- [ ] Backup/restore rehearsal và reconciliation tiền/tồn.
- [ ] Không còn P0/P1 mở.

## 9. Decision còn cần chủ dự án chốt

Các mặc định đề xuất để không chặn phân tích:

1. **Warranty:** đưa sang V1.1; V1 chỉ hiển thị nội dung chính sách bảo hành.
2. **Forgot password:** V1 gửi email; OTP điện thoại làm sau khi có provider.
3. **Mã địa chỉ:** V1 lưu mã GHN kèm `codeProvider`, không gọi đó là mã hành chính chung.

Ba quyết định này phải được xác nhận trước khi bắt đầu đúng wave liên quan, không chặn R0.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-20 | Tạo kế hoạch production readiness và hoàn thiện V1 từ audit source/schema thực tế. |
