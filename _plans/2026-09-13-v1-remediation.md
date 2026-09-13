# API plan: V1 remediation — outbox, persistence gap và mock removal

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Tách H2b sang plan riêng và bổ sung C12 (gộp customer) sau bước verify.

## Scope and DoR

Kế hoạch khắc phục khoảng cách giữa tài liệu V1 đã duyệt và hiện trạng code, phát hiện qua rà soát ngày 2026-09-13.

Số liệu nền:

| Chỉ số | Giá trị |
|---|---|
| Bảng thiết kế (`09-v1-model.dbml`) | 75 |
| Entry trong `model-registry.data.ts` | 75 (khớp 100%) |
| Bảng đã persist trong `schema.prisma` | 45 (60%) |
| Migration hiện có | 31 |
| Open decision còn `PROPOSED` | 10/47 |

Trong scope: API repository, cộng các mục consumer bắt buộc ở `client` và `admin`.
Ngoài scope: Wave 7 (flash sale, stocktake, return/refund, notification provider), tối ưu hiệu năng, e-invoice.

### Definition of Ready

- [x] DBML và model registry đã khớp, không cần đồng bộ trước.
- [x] Transaction boundary của 5 luồng lõi đã được mô tả ở `03-database-v1.md` mục 5.
- [ ] D19/D20 được chốt trước khi làm hạng mục backup/retention (H9).

## Existing flows and GitNexus impact

MCP `gitnexus` không kết nối được trong phiên rà soát (ENOENT). Impact analysis dưới đây dựa trên đọc source tĩnh và **phải chạy lại bằng graph trước khi sửa từng symbol**:

```bash
node .gitnexus/run.cjs impact "PaymentService.reviewAdmin" --direction upstream --repo .
node .gitnexus/run.cjs impact "OrderService.place" --direction upstream --repo .
node .gitnexus/run.cjs impact "FulfillmentService" --direction upstream --repo .
```

Luồng bị chạm nhiều nhất: `checkout.place → order.place → payment.confirm → fulfillment.ship`. Mọi hạng mục H1 đều chèn vào bên trong transaction của các service này.

## Domain rules and transitions

Không thay đổi state machine nào. Không thêm/bớt transition. Các invariant ở `06-rules-and-state-machines.md` mục 1 giữ nguyên, đặc biệt:

- Invariant 5 (payment success không trừ tồn; chỉ SHIPPED mới trừ) — **không được chạm**.
- Invariant 6 (ledger/history append-only).
- Invariant 8 (maker-checker) — hiện **chưa được thực thi**, xem H4.

---

## Hạng mục khắc phục

### H1 — Outbox: ghi trước, publish sau (P0)

**Quyết định chốt:** phương án (c) — tạo bảng và ghi event ngay trong V1; publisher worker hoãn tới Wave 7 khi có provider thật.

Lý do: phần đắt và rủi ro là chèn `INSERT` vào 5 transaction `Serializable` đang chạy; làm lúc chưa có traffic production thì rẻ. Publisher tách rời hoàn toàn, thêm sau không đụng code giao dịch. Đổi lại Wave 7 có sẵn lịch sử event để replay.

**Làm ngay:**

1. Migration `add_outbox_events` theo đúng `09-v1-model.dbml`, bật RLS deny-by-default như mọi base table khác.
2. Helper `appendOutboxEvent(tx, event)` đặt cạnh writer audit hiện có, nhận `Prisma.TransactionClient`.
3. Gọi trong 5 transaction boundary:

| Boundary | Service | `event_type` |
|---|---|---|
| Create order | `OrderService.place` | `order.placed` |
| Payment success | `PaymentService.reviewAdmin` (CONFIRM) | `payment.succeeded` |
| Ship | `FulfillmentService` ship | `fulfillment.shipped` |
| Cancel trước payment | `OrderService.cancel` | `order.cancelled` |
| Delivery failed | `FulfillmentService` fail | `fulfillment.delivery_failed` |

4. `payload_json` là **snapshot tại thời điểm commit**, không phải reference để worker đọc lại sau.

**Hoãn Wave 7:** publisher worker (`FOR UPDATE SKIP LOCKED` + backoff), dead-letter, dashboard outbox lag.

**Sửa doc cùng task:** `03-database-v1.md` ghi rõ V1 ghi outbox nhưng chưa publish; thêm decision mới vào `08-open-decisions.csv`.

### H2 — Persist CMS và Review (P0)

`cms.service.ts` và `review.service.ts` hiện là mảng literal trong process memory nhưng được `src/modules/README.md` liệt kê ACTIVE, đã phát hành OpenAPI và đã được cả admin lẫn client tích hợp.

Hệ quả đang chịu: mất dữ liệu khi restart; multi-instance lệch trạng thái moderation; `version: 0` hardcode làm optimistic lock vô nghĩa.

Migration 9 bảng: `posts`, `pages`, `banners`, `post_categories`, `post_tags`, `post_products`, `product_reviews`, `product_review_comments`, `product_review_media`.

Yêu cầu: giữ nguyên DTO và OpenAPI contract để **không phải regenerate SDK** ở hai FE; dữ liệu literal hiện tại chuyển thành seed.

### H2b — Xác minh danh tính khách hàng (P0, chặn staging)

Tách thành plan riêng vì phạm vi vượt một hạng mục: cần bảng mới ngoài 75 bảng đã duyệt, cần provider gửi mã, và cần 3 decision nghiệp vụ.

→ **`_plans/2026-09-13-customer-identity-verification.md`**

### C12 — Guest checkout gộp nhầm bản ghi `customers` (P2)

`checkout.service.ts:445` gộp guest theo `normalizedPhone`/`normalizedEmail` chưa xác minh:

```ts
const existing = await this.prisma.customer.findFirst({ where: { OR: [
  { normalizedPhone }, ...(normalizedEmail ? [{ normalizedEmail }] : []),
] } });
if (existing) return existing.id;
```

Khách B nhập SĐT của khách A → đơn của B gắn vào `customer` record của A.

**Đã verify là KHÔNG phải lỗ hổng bảo mật.** Quyền đọc/hủy đơn scope theo `checkoutSession.cartId` (guest) hoặc `checkoutSession.cart.userId` (account), **không** theo `customer_id` — xem `order.service.ts:368 findOwnedOrder` và `assertPlacementOwnership`. Không có đường đọc chéo.

Ảnh hưởng thật: **sổ khách hàng của Admin bị trộn** — một bản ghi customer chứa đơn của nhiều người, tên/địa chỉ ghi đè lẫn nhau, thống kê theo khách sai.

Xử lý: bỏ dedupe theo định danh chưa xác minh, mỗi guest checkout tạo bản ghi riêng. Chỉ khôi phục dedupe sau khi H2b xong (gộp theo định danh **đã verified**).

Lưu ý ops: số bản ghi `customers` sẽ tăng, màn hình Admin customers phình — báo trước, không phải lỗi.

### H3 — Ghi nhận deviation idempotency (P0, chỉ tài liệu)

Code dùng unique column theo từng aggregate (11 chỗ trong schema) thay cho bảng `idempotency_keys` tập trung. Cách này hợp lý hơn cho transition, nhưng khác spec ở điểm: replay **dựng lại response từ state hiện thời**, không trả bản chụp như `03-database-v1.md:131` mô tả ("Idempotency body/response 24–72 giờ").

Hệ quả: cùng một idempotency key, retry sau khi state đã đi tiếp sẽ nhận body khác lần đầu.

Việc cần làm: thêm decision mô tả deviation; sửa mục 7 của `03-database-v1.md`. Chỉ làm bảng tập trung nếu FE thật sự cần replay body ổn định — hiện `04-offline-commerce-ux.md` của client quy định mutation không auto-retry nên nhiều khả năng không cần.

### H4 — Maker-checker cho stock adjustment (P1)

`StockAdjustment` đã persist và đang chạy; `approval_requests` chưa tồn tại; module `approval` = 4 dòng rỗng. Invariant 8 hiện không được thực thi.

Giảm thiểu ngay (rẻ): siết quyền `CORRECTION` giảm về OWNER/GLOBAL, bắt buộc reason, thêm alert mỗi lệnh giảm.
Làm đủ (Wave 7): `approval_requests` với immutable proposed payload + executor idempotent.

### H5 — Client bỏ mock trên bề mặt thương mại (P0/P1)

| Vị trí | Hiện trạng | Xử lý | Ưu tiên |
|---|---|---|---|
| `app/products/[slug]/page.tsx` | API lỗi → fallback `getMockProductDetail` | Bỏ fallback, trả error state | P0 |
| `features/profile/profile-page.tsx` | `MOCK_INITIAL_ADDRESSES`, `MOCK_WARRANTIES` | Nối `customer.yaml` (bảng đã persist) | P1 |
| `features/reviews/product-review-section.tsx` | mock | Nối `reviews.yaml` sau H2 | P1 |
| `features/home/*` | mock | Giữ tới khi CMS có dữ liệu thật (H2) | P2 |
| `admin/features/customers` | `customers.fixture` | Nối contract customer | P1 |

Fallback mock ở trang chi tiết sản phẩm vi phạm source-of-truth giá ở `03-database-v1.md` mục 3 và rule `04-offline-commerce-ux.md` (dữ liệu stale phải được gán nhãn).

### H6 — Test concurrency cho fulfillment (P1)

`fulfillment.service.ts` 905 LOC giữ transaction phức tạp nhất (chạm `on_hand`, `reserved`, reservation state, movement, order history) nhưng chỉ có 1 spec.

Test tối thiểu, theo đúng danh sách bắt buộc ở `07-delivery-plan.md` mục 4:

- Hai request ship song song cùng fulfillment → đúng một lần trừ tồn.
- Ship khi reservation đã EXPIRED → từ chối, không tự cấp lại tồn.
- 100 request reserve cùng SKU → không `reserved > on_hand`.
- Hai worker expire cùng reservation → không double release.
- Duplicate ship command cùng idempotency key → một side effect.

### H7 — Heartbeat cho hai cron worker (P1)

`reservation-expiry` và `order-maintenance` chạy qua Supabase Cron. Auto-complete sau 72h **ghi nhận doanh thu**. Cron chết im lặng → tồn bị giữ vô hạn và doanh thu không được ghi.

Metric tối thiểu: tuổi reservation ACTIVE quá hạn cũ nhất; số order DELIVERED quá 72h chưa COMPLETED. Vượt ngưỡng = cron chết.

### H8 — Tách service quá tải (P2)

`products.service.ts` 1.314 LOC, `order.service.ts` 1.115 LOC. Tách theo use case **trước** khi Wave 7 nhồi flash sale/pricing vào. Dùng `rename`/`impact` của GitNexus, không find-and-replace.

### H9 — Chốt D19/D20 (P1, cần business)

Cả hai ghi `blocking_wave = 0` nhưng vẫn `PROPOSED`. Không thiết kế được backup strategy khi chưa có RPO/RTO. Cần owner Legal+Finance và Business+Tech quyết.

### H10 — Dọn drift tài liệu (P2)

`src/modules/README.md` và `07-delivery-plan.md` ghi "74 bảng"; DBML và registry đều 75.

---

## Prisma schema, migration and data compatibility

Ba migration forward-only, độc lập nhau, chạy được theo thứ tự bất kỳ:

| Migration | Bảng | Hạng mục |
|---|---|---|
| `add_outbox_events` | 1 | H1 |
| `add_cms_content_tables` | 6 | H2 |
| `add_product_review_tables` | 3 | H2 |

Ràng buộc chung: RLS deny-by-default; revoke quyền `anon`/`authenticated`; `outbox_events` có partial index `(available_at, created_at) WHERE status IN ('PENDING','RETRY')` theo `03-database-v1.md` mục 6; không cascade delete.

Sau migration, độ phủ persistence: 45 → **55/75 (73%)**.

## API V1 and OpenAPI compatibility

- H1: **không đổi contract**, outbox thuần nội bộ, không xuất ra OpenAPI.
- H2: giữ nguyên DTO/response shape hiện có → không cần `generate:api` ở admin/client.
- H4 (giảm thiểu): siết permission, có thể đổi mã lỗi → cần kiểm tra lại `content.yaml`/`inventory.yaml`.

Nếu contract thực sự đổi: `yarn openapi:generate` ở api, rồi `yarn contracts:sync && yarn generate:api` ở từng FE. Không sửa tay `src/generated/api`.

## Permission, branch scope and audit

- Outbox không có endpoint, không cần permission.
- CMS/Review giữ nguyên permission hiện hành; H2 chỉ đổi nơi lưu.
- H4 đổi permission thật → cần data migration cấp quyền và tăng `users.permission_version` cho role-holder đang hoạt động, theo `03-database-v1.md` mục 3.

## Transaction, locking and idempotency

H1 là hạng mục duy nhất chạm transaction đang chạy. Quy tắc bắt buộc:

- `appendOutboxEvent` nhận `Prisma.TransactionClient`, **không** nhận `PrismaService` — chặn khả năng ghi ngoài transaction.
- INSERT đặt **cuối** transaction, sau khi mọi state đã chốt.
- Không thêm lock mới, không đổi thứ tự lock hiện có (warehouse → variant).
- Không gọi network trong transaction, kể cả sau khi có publisher.

## Unit, integration and HTTP test matrix

| Hạng mục | Unit | Integration (PostgreSQL) | Concurrency |
|---|---|---|---|
| H1 | helper ghi đúng shape | event xuất hiện đúng 1 lần/boundary; rollback → không có event | ship song song → 1 event |
| H2 | service CRUD | persist qua restart; moderation state bền vững | optimistic lock qua `version` |
| H4 | maker ≠ approver | permission denial | — |
| H6 | — | — | 5 kịch bản ở H6 |

Gate: `yarn lint && yarn test && yarn prisma:validate && yarn openapi:generate && yarn build`.

## Documentation, generated consumers and rollout

Cập nhật cùng task, không để sang task sau:

- `08-open-decisions.csv`: 2 decision mới (outbox, idempotency deviation).
- `03-database-v1.md`: mục 5 (outbox ghi-chưa-publish), mục 7 (idempotency deviation) + revision history 2.9.0.
- `src/modules/README.md`: CMS/Review từ in-memory → persisted; sửa 74 → 75.
- `11-model-change-log.json`: entry cho 3 migration.
- Workbook annotate theo `.agent/skills/db-api-document-traceability/SKILL.md`.

Rollout: từng migration một, chạy dev → verify → staging. Không gộp 3 migration vào một release.

## Thứ tự thực thi đề xuất

```
Đợt 1 (P0, không phụ thuộc nhau — làm song song được)
  H1 outbox ghi          H3 doc idempotency      H5-P0 bỏ mock fallback
  H2 persist CMS/Review  H10 sửa 74→75

Đợt 2 (P1)
  H6 test fulfillment → H7 heartbeat → H5-P1 nối profile/reviews/customers
  H4 siết quyền adjustment
  H9 chốt D19/D20 (song song, cần business)

Đợt 3 (P2, trước Wave 7)
  H8 tách products.service / order.service
```

## Risks and open decisions

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Chèn INSERT vào transaction Serializable gây serialization failure tăng | Trung bình | Đã có `withSerializationRetry`; đo lại tỉ lệ retry sau khi triển khai |
| H2 làm lộ chỗ DTO hiện tại không đủ field cho bảng thật | Trung bình | Giữ contract, thêm cột DB không map ra DTO ở V1 |
| H4 siết quyền chặn thao tác kho đang chạy | Thấp | Thông báo ops trước; giữ ngưỡng 10 đơn vị cho branch scope |
| GitNexus MCP đang lỗi kết nối, không chạy được impact | Trung bình | Sửa MCP hoặc dùng CLI `node .gitnexus/run.cjs` trước mỗi lần sửa symbol |

Open decision cần chốt: D19, D20 (blocking wave 0); D04 (blocking wave 5, đang dở).

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.1.0 | 2026-09-13 | Tách H2b (xác minh danh tính) sang plan riêng; thêm C12 sau khi verify gộp customer không phải lỗ hổng bảo mật. | REVIEW-20260913-V1-GAP |
| 1.0.0 | 2026-09-13 | Tạo kế hoạch khắc phục V1; chốt outbox phương án ghi-trước-publish-sau. | REVIEW-20260913-V1-GAP |
