# Báo cáo tổng hợp Playwright — Admin và Storefront

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-18
>
> **Change summary:** Lập kịch bản, chạy E2E hai FE, sửa lỗi phát hiện và ghi rõ vùng chưa kiểm do chưa có database test cô lập.

## Phạm vi và an toàn dữ liệu

- Admin chạy bản Vite build ở chế độ E2E; mọi Admin API trong spec được mock theo DTO generated. Không đụng database.
- Storefront chạy Next production build trên cổng 3199; spec hiện có chỉ GET API catalog/content và thao tác giỏ trong browser context. API local cổng 4000 đọc từ môi trường dev; **không** tạo đơn, tài khoản hay thanh toán.
- Không dùng credential admin hoặc seed/xoá dữ liệu Supabase trong đợt kiểm này. Test mutation thật cần DB test riêng và cleanup theo run ID.
- Kịch bản chi tiết: `admin/e2e/plan/test-plan.md` và `client/e2e/plan/test-plan.md`.

## Kết quả sau sửa

| Project | Playwright | Static/unit | Môi trường test | Giới hạn bằng chứng |
| --- | --- | --- | --- | --- |
| Admin | **17/17 pass** (`CI=1 yarn test:e2e`) | Lint pass, 59/59 unit pass; E2E build Vite pass | API mock, 2 Chromium workers | Chưa phải tích hợp với API/DB thật |
| Storefront | **41/41 pass** (`E2E_API_URL=http://127.0.0.1:4000 CI=1 yarn e2e`) | Lint pass, 18/18 unit pass; E2E build Next pass | API thật đọc-only, 2 Chromium workers | Phụ thuộc dữ liệu catalog/content ở môi trường dev; chưa kiểm POST checkout |

CI Admin đã được cấu hình chạy Playwright trong `.github/workflows/quality.yml`, nhưng **chưa xác minh lượt GitHub Actions sau khi push**. Client E2E chưa đưa vào CI vì cần API và dữ liệu test cô lập; chạy trên DB dùng chung sẽ làm kết quả phụ thuộc môi trường và có nguy cơ ghi dữ liệu khi mở rộng luồng.

## Phát hiện và cách xử lý

| ID | Phát hiện | Phân loại | Sửa và bằng chứng |
| --- | --- | --- | --- |
| E2E-01 | `next dev` khi chạy Client Playwright chạm giới hạn watcher (`ENOSPC`), log lặp lớn | Hạ tầng test | Mặc định build + `next start`; `E2E_DEV=1` chỉ dùng debug. Sau sửa 41/41 pass. |
| E2E-02 | Drawer tạo/sửa khách có tiêu đề nhìn thấy nhưng dialog không có accessible name | Admin accessibility | Gắn `aria-label` theo chế độ tạo/sửa; CUS-02/CUS-03 pass và Playwright định vị được bằng role + name. |
| E2E-03 | Reset PWA unregister tất cả worker cùng origin, có thể ảnh hưởng ứng dụng khác | Storefront isolation | Lọc đúng script `/sw.js` và root scope; 3 unit + PWA-03 pass, cache khác được giữ. |
| E2E-04 | Client Playwright ghi vào `e2e/.artifacts` có 10 artifact lịch sử được Git theo dõi, làm dirty worktree | Hạ tầng test | Chuyển output/report sang `.playwright/` đã ignore; khôi phục nguyên trạng artifact cũ. |

Không có bằng chứng lỗi backend trong các ca đã chạy. Điều đó **không** có nghĩa backend checkout/payment/inventory đã được E2E xác nhận: Admin dùng mock và Client hiện chỉ đọc API.

## Các kịch bản cần làm tiếp

| Ưu tiên | Luồng | Điều kiện trước khi chạy |
| --- | --- | --- |
| P0 | Client guest/account checkout → quote → order → payment/COD → xem đơn; kiểm idempotency và lỗi tồn kho | DB test cô lập, seed/cleanup lặp lại được, payment sandbox |
| P0 | Admin Orders/Inventory/Payments: transition, permission, 409, retry không nhân đôi | Mock contract + smoke trên staging cô lập |
| P1 | Admin Customers sửa/409, ngừng hoạt động, xoá bị chặn khi đã có đơn, branch scope | Mở rộng mock E2E; không cần DB thật cho UI policy |
| P1 | Client API 5xx/timeout, giá/tồn thay đổi trong giỏ, variant/combo hết hàng | Mock ở client boundary hoặc API test fixture cô lập |
| P1 | PWA cài đặt trên HTTPS, update prompt, offline navigation, route riêng tư không cache | Staging HTTPS; kiểm trên Chromium mobile/desktop |

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-18 | Kịch bản, 58 ca E2E đạt, bốn phát hiện và backlog kiểm thử cô lập. |
