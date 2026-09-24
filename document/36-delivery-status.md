# Trạng thái bàn giao — nguồn tiến độ duy nhất

> **Document version:** 1.8.0
>
> **Last updated:** 2026-09-24
>
> **Change summary:** Backend Return/Refund V1; cron notification-dispatch đã đăng ký trên Supabase.

## Tài liệu này dùng để làm gì

Trước đây mỗi sprint tự khai tiến độ trong tài liệu riêng. Khi việc của sprint sau hoàn thành
nốt phần còn thiếu của sprint trước, không ai quay lại sửa, nên tài liệu cũ giữ mãi con số lỗi
thời và mất khả năng trace.

Từ nay:

- **Chỉ tài liệu này khai tiến độ.** Tài liệu sprint giữ lại làm hồ sơ thiết kế và quyết định
  kỹ thuật, không còn là nguồn trạng thái.
- Mọi khẳng định ở đây phải kèm bằng chứng kiểm được bằng lệnh hoặc truy vấn.
- Mục nào chưa kiểm được thì ghi rõ **chưa kiểm chứng**, không đoán.

## Phân biệt hai loại "xong"

| Loại | Nghĩa |
| --- | --- |
| **Xong trong mã nguồn** | Code, test, migration, tài liệu đã có trong repo |
| **Đã bật trên môi trường chạy** | Cần chủ dự án cấu hình: cron, khoá bí mật, deploy |

Một tính năng có thể xong trong mã nguồn nhưng chưa bật trên môi trường chạy. Hai cột này
không được gộp làm một.

## Trạng thái theo khối chức năng

| Khối | Mã nguồn | Môi trường chạy | Bằng chứng |
| --- | --- | --- | --- |
| Nền tảng dữ liệu, ID BIGINT | ✅ | ✅ trên DB dev hiện tại; production chưa kiểm | `yarn db:status` ngày 2026-09-18: 55 migrations, schema up to date |
| Catalog thật | ✅; Product + initial SKU aggregate create | ⚠️ Chờ deploy API/Admin mới | 596 sản phẩm, 61 danh mục; create transaction + generated SDK |
| Bài viết và chính sách | ✅ | ✅ | 10 bài thật + 9 trang chính sách |
| Giỏ hàng, checkout, đặt hàng | ✅ | ✅ | Đơn thật chạy trọn luồng |
| Giữ hàng và hết hạn giữ hàng | ✅ | ⚠️ Cần bật cron | Có worker + `reservation-expiry.integration-spec.ts`; configurator `scripts/configure-reservation-expiry-cron.cjs` |
| Giao vận | ✅ | ✅ | Chuỗi PICKING → DELIVERED chạy thật |
| Thanh toán VNPay | ✅ | ⚠️ Chờ khoá | Backend + IPN + trang kết quả; khoá SMTP/VNPay do chủ dự án cấp |
| Bán tại quầy | ✅ | ✅ | `ORD-20260915-00000025`, `...26` |
| Flash sale + quota | ✅ | ⚠️ Cần bật cron | `test/flash-sale-quota.integration-spec.ts` — 6 test trên PostgreSQL thật |
| Báo cáo và Dashboard | ✅ | ✅ | 5 endpoint `Admin Reporting` + tổng hợp tồn kho |
| Export báo cáo CSV/XLSX | ⚠️ Backend xong 5 endpoint; **Admin chưa có nút tải** | ❌ Chưa dùng được vì thiếu giao diện | `exportAdminReportRevenue/…/exportAdminReportInventory`; `src/modules/reporting/export/` |
| Quản lý khách hàng | ✅ | ✅ | `Admin Customers`; fixture đã xoá |
| Vai trò và phân quyền | ✅; OWNER được bảo vệ full permission catalog | ⚠️ Chờ deploy bản IAM mới | CRUD + cây quyền; API 381/381 unit tests pass ngày 2026-09-20 |
| Tồn kho | ✅; adjustment có idempotency, retry serialization và timeout | ✅; cần redeploy bản resilience mới | Transaction rollback-only trên Supabase; unit test P2034/P2010/P2024/P2028 |
| Ghi nhớ đăng nhập | ✅; Backend phân biệt session/persistent refresh cookie và giữ lựa chọn khi rotate | ⚠️ Chờ deploy API/Admin mới | `LoginDto.rememberMe`; `auth-token-transport.service.spec.ts` |
| E2E trình duyệt | ⚠️ Admin 17/17, Storefront 41/41; chưa phủ checkout/Orders/Inventory mutation | ⚠️ Admin đã cấu hình CI, chưa xác minh run trên GitHub; Client chưa gắn CI | `document/37-playwright-e2e-report.md` |
| PWA Storefront | ⚠️ Icon PNG và manifest đã có, chưa nghiệm thu cài đặt/offline | ❌ **Không kiểm được**: `baoansport.vn` đang là site PHP cũ, không phải Next.js app | `/manifest.webmanifest`, `/sw.js`, `/offline` đều trả HTTP 410 ngày 2026-09-24; `x-powered-by: PHP/7.4.33` |
| Storefront trên domain thật | ❌ Chưa deploy | ❌ `/login` trả 500, `/gio-hang` và asset tĩnh trả 410 | Domain trỏ site cũ; `VNPAY_RETURN_URL` vì thế cũng trỏ vào trang 410 |
| Đổi trả và hoàn tiền | ⚠️ Backend xong (15 endpoint Account/Admin Returns, 4 bảng, migration chưa áp lên DB); **Admin/Storefront chưa có màn hình**; chưa có integration test PostgreSQL | ❌ Chưa deploy, chưa migrate | `modules/return/`, `20260924120000_return_refund_foundation`, 93 unit test trong `modules/return` |
| Thông báo và email | ✅ Outbox + worker + dead-letter + 4 mẫu email (đặt hàng, cập nhật giao vận, đặt lại mật khẩu, đổi mật khẩu thành công) | ⚠️ Cron `dctd-notification-dispatch` đã đăng ký 2026-09-24 (mỗi phút, 2 lượt đầu HTTP 200, outbox rỗng); chưa xác minh gửi thật qua Mailtrap | `modules/notification/outbox-dispatcher.service.ts`, `outbox.writer.ts`, `notification.templates.ts` |
| Hồ sơ khách và đổi mật khẩu | ✅ Cập nhật hồ sơ, quên/đặt lại/đổi mật khẩu, `password_reset_tokens` chỉ lưu hash | ⚠️ Chờ deploy; cần `STOREFRONT_BASE_URL` để link trong email trỏ đúng | `modules/auth/password-reset.service.ts`, `modules/customer/customer-profile.service.ts` |
| Bảo hành | ❌ | ❌ | Chưa có model `Warranty` |

## Việc còn lại

Kế hoạch thực thi và phân tích rủi ro chuẩn nằm ở
`document/39-v1-production-readiness-and-feature-completion-plan.md`.
`client/_plans/close-out-v1.md` chỉ còn là checklist hỗ trợ riêng Storefront. Tóm tắt:

| Mã | Việc | Ước lượng |
| --- | --- | --- |
| B1 | Đồng bộ trạng thái tài liệu sprint cũ, tránh checklist mâu thuẫn | 0.5 ngày |
| B2 | Sửa soft-404 trên route động | 0.5 ngày |
| B3 | Chuẩn hoá thông báo lỗi sang tiếng Việt | 1 ngày |
| ~~B4~~ | ~~Notification use case + gửi email qua adapter đã có~~ — **đã xong ở mã nguồn**, còn đăng ký cron và nghiệm thu gửi thật | — |
| ~~B5~~ | ~~Vật lý hoá Outbox + retry/dead-letter~~ — **đã xong**, gồm cả thu hồi lock quá hạn | — |
| B6 | Export báo cáo CSV/XLSX — **Backend xong**, còn nút tải ở Admin | 0.5 ngày |
| B7 | Nghiệm thu cài đặt/offline/update/reset trên HTTPS; icon PNG đã có | 0.5 ngày |
| B8 | Giảm bundle Admin (chunk chính 748 kB, charts 370 kB ở build 2026-09-18) | Cần phân tích tách route/chunk, chưa ước lượng lại |
| B9 | Đồng bộ giỏ hàng nhiều thiết bị | 1–2 ngày |
| R2 | Đổi trả → Kiểm tra → Hoàn tiền | 5–7 ngày |

Các blocker cần xử lý trước khi đóng production: bảo vệ OWNER gốc, đồng bộ OpenAPI/SDK
Storefront, chuẩn hoá mã địa chỉ GHN xuyên suốt DB/API/UI, hardening refresh cookie/CSRF và
login rate limit, cron có khả năng quan sát, E2E mutation trên DB cô lập, VNPay sandbox và
PWA HTTPS acceptance. Ước lượng R2 cũ chỉ bao phủ happy path; estimate sau phân tích đầy đủ là
8–12 ngày cho Return/Inspection/Refund full stack.

## Việc của chủ dự án

- Bật cron trên Supabase cho giữ hàng hết hạn và quota flash sale
- Cấp khoá SMTP (cho B4) và khoá VNPay production
- Redeploy `admin` và `api`
- Xác nhận 7 cam kết marketing đang hiển thị trên storefront
- Xác minh pipeline Admin E2E chạy xanh trên GitHub; quyết định môi trường API/DB cô lập trước khi đưa Client E2E vào CI

## Kiểm chứng mới nhất (2026-09-21)

### Kiểm chứng 2026-09-21

- Backend nhận `rememberMe` từ login contract. Không chọn ghi nhớ thì refresh token chỉ nằm trong
  session cookie; có chọn thì cookie tồn tại tối đa `JWT_REFRESH_TTL_SECONDS`. Refresh rotation
  giữ nguyên lựa chọn bằng cookie HttpOnly theo audience; logout xóa cả hai cookie.
- Full API gate pass: 81 suite/393 test, Prisma validate, OpenAPI export và build. Admin lint,
  23 file/70 unit test, production build, Storybook build và Auth Playwright 6/6 pass. Storefront
  lint, 6 file/18 test và production build pass; `/category` prerender phải retry một lần do
  network quá 60 giây, là rủi ro build-time đã biết và không phát sinh từ Auth.

- Truy vết `POST /api/v1/admin/inventory/adjustments`: CORRECTION và MANUAL_RECEIPT chạy
  hết transaction trên đúng Supabase rồi chủ động rollback; không thay đổi tồn hoặc tạo ledger.
- Production replay một adjustment cũ bằng cùng `Idempotency-Key` thành công; lỗi báo cáo không
  phải thiếu bảng/contract cố định. Inventory bổ sung retry tối đa 3 lần cho Prisma P2034 và raw
  SQLSTATE 40001, `maxWait=10s`, `timeout=30s`; P2024/P2028 được trả 503 tiếng Việt.
- Unit Inventory 10/10 pass, gồm retry và timeout mapping. Full API gate pass: lint, 80 suites/
  388 tests, Prisma validate, OpenAPI generate và production build.

### Kiểm chứng 2026-09-20

- `client/yarn lint`, `client/yarn test` (6 file, 18 test) và `client/yarn build`: pass.
  Test fetcher đã dùng đúng default runtime `http://127.0.0.1:4000`, không đổi implementation
  API dùng chung. Build `/category` phải retry một lần vì prerender quá 60 giây; đây là rủi ro
  build-time network đã được đưa vào kế hoạch 39.
- `admin/yarn lint`, `admin/yarn test` (23 file, 68 test), `admin/yarn build` và
  `admin/yarn build-storybook`: pass. Bundle chính vẫn khoảng 650 kB và tiếp tục là việc tối ưu.
- API lint pass; 381/381 unit tests pass; Prisma schema validate pass. OWNER không thể
  bị giảm quyền, deactivate/delete; seed bổ sung permission mới còn thiếu cho OWNER nhưng giữ
  cấu hình role cấp dưới. Chưa seed hoặc thay đổi dữ liệu Supabase trong lượt này.
- Product create contract nhận 1–50 initial variants; Product/category/SKU/audit nằm cùng
  transaction. Admin hiển thị thông tin Product và danh sách biến thể trên một drawer; mapper
  test, Admin test/build và OpenAPI export pass. Chưa chạy E2E mutation vì chưa có DB test cô lập.

### Kiểm chứng 2026-09-18

- `api/yarn db:status`: 55 migration, database dev được cấu hình hiện tại đã đồng bộ; lệnh chỉ đọc, không seed/migrate.
- `admin/CI=1 yarn test:e2e`: 17/17 ca pass trên API mock; `client/CI=1 yarn e2e`: 41/41 ca pass với API local đọc-only. Xem giới hạn tại `document/37-playwright-e2e-report.md`.
- `client/yarn lint`, `client/yarn test` (5 file, 15 test) và `client/yarn build`: pass. Manifest bản build trả đúng icon PNG 192/512, cả hai URL icon trả HTTP 200. Nghiệm thu cài đặt/offline/update trên HTTPS vẫn chưa làm.
- `admin/yarn build`: pass nhưng cảnh báo chunk `index` 748.07 kB; `vendor-charts` 370.16 kB. `client/yarn build`: trang `/` 210 kB First Load JS. Đây là rủi ro hiệu năng chưa xử lý, không phải lỗi build.
- Return/Refund có model Prisma và endpoint (2026-09-24) nhưng chỉ kiểm bằng unit test trên Prisma giả; CHECK, partial unique index và khoá đồng thời chưa chạy trên PostgreSQL. Warranty vẫn chưa có model.
- Kiểm ngày 2026-09-24: API production (`sport-api-doc.vercel.app/api/v1/health`) trả 200. Nhưng
  `baoansport.vn` **không phải Storefront** — header `x-powered-by: PHP/7.4.33`, tức site cũ. `/login`
  trả 500, `/gio-hang`, `/sw.js`, `/manifest.webmanifest`, `/icon-192.png` đều trả 410. Vì vậy PWA
  và luồng trả về của VNPay (`VNPAY_RETURN_URL` trỏ vào chính domain đó) **chưa thể nghiệm thu**.
- Cron: `dctd-reservation-expiry`, `dctd-order-maintenance` và `dctd-flash-sale-quota-expiry` đã
  đăng ký, timeout nâng lên 30s. Bằng chứng lấy từ `net._http_response` chứ không phải
  `cron.job_run_details` — bảng sau chỉ chứng minh pg_cron đã xếp hàng request. Còn lại: job
  notification-dispatch **chưa đăng ký**, flash-sale trả `enabled:false` vì biến môi trường chưa bật
  trên Vercel, và vẫn còn lượt timeout ở mốc 30s.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.8.0 | 2026-09-24 | Backend Return/Refund V1 (API-20260924-RETURN-REFUND-V1); đăng ký cron notification-dispatch. |
| 1.7.0 | 2026-09-24 | Notification/outbox, hồ sơ và mật khẩu, export báo cáo; ghi nhận Storefront chưa deploy lên domain thật. |
| 1.6.0 | 2026-09-21 | Hoàn thiện remember-me Backend và trace trạng thái triển khai. |
| 1.5.0 | 2026-09-21 | Harden adjustment transaction/retry/timeout và chuẩn hóa lỗi transient thành 503 tiếng Việt. |
| 1.4.0 | 2026-09-20 | Product + initial SKU aggregate create atomic và Admin form một màn hình. |
| 1.3.0 | 2026-09-20 | Thêm nguồn kế hoạch V1/production chuẩn, cập nhật blocker và estimate Return/Refund. |
| 1.2.0 | 2026-09-18 | Cập nhật báo cáo Playwright hai FE và khoảng trống kiểm thử tích hợp. |
| 1.1.0 | 2026-09-18 | Đối chiếu DB dev, CI Admin E2E, PWA icon và email adapter với code thực tế. |
| 1.0.0 | 2026-09-15 | Tạo nguồn tiến độ duy nhất. |
