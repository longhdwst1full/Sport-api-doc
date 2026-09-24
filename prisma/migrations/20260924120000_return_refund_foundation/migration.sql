-- Return/Refund V1 (D60): 4 bảng return_requests, return_items, return_status_history, refunds.
--
-- Khác DBML review ban đầu: KHÔNG tạo return_policies (cửa sổ trả là tham số RETURN_WINDOW_DAYS,
-- danh mục loại trừ là categories.returnable theo D54), KHÔNG dùng approval_requests (duyệt theo
-- quyền return.decide theo D56), KHÔNG tách refund_transactions (một phiếu có nhiều dòng refunds,
-- lượt lỗi đánh FAILED rồi tạo lượt mới). Bảng mới chưa có dữ liệu nên migration chỉ thêm, không
-- đụng dữ liệu nghiệp vụ hiện có.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "returnable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "return_requests" (
    "id" BIGSERIAL NOT NULL,
    "return_no" VARCHAR(32) NOT NULL,
    "order_id" BIGINT NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "branch_id" BIGINT NOT NULL,
    "warehouse_id" BIGINT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
    "channel" VARCHAR(16) NOT NULL,
    "reason_code" VARCHAR(32) NOT NULL,
    "description" VARCHAR(2000),
    "evidence_urls" JSONB,
    "fault" VARCHAR(16),
    "delivered_at" TIMESTAMPTZ(6) NOT NULL,
    "window_override_by" BIGINT,
    "window_override_note" VARCHAR(500),
    "refund_cap" DECIMAL(19,2),
    "idempotency_key" VARCHAR(150) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "created_by" BIGINT NOT NULL,
    "decided_by" BIGINT,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" VARCHAR(500),
    "received_by" BIGINT,
    "received_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" BIGSERIAL NOT NULL,
    "return_request_id" BIGINT NOT NULL,
    "order_item_id" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" VARCHAR(16),
    "disposition" VARCHAR(16),
    "restock_qty" INTEGER NOT NULL DEFAULT 0,
    "refund_cap" DECIMAL(19,2),
    "note" VARCHAR(500),

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_status_history" (
    "id" BIGSERIAL NOT NULL,
    "return_request_id" BIGINT NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "from_status" VARCHAR(24),
    "to_status" VARCHAR(24) NOT NULL,
    "reason" VARCHAR(500),
    "actor_type" VARCHAR(16) NOT NULL,
    "actor_id" BIGINT,
    "request_id" VARCHAR(100) NOT NULL,
    "idempotency_key" VARCHAR(150),
    "request_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" BIGSERIAL NOT NULL,
    "refund_no" VARCHAR(32) NOT NULL,
    "return_request_id" BIGINT NOT NULL,
    "payment_id" BIGINT NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'VND',
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "external_ref" VARCHAR(255),
    "note" VARCHAR(500),
    "idempotency_key" VARCHAR(150) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "requested_by" BIGINT NOT NULL,
    "processed_by" BIGINT,
    "processed_at" TIMESTAMPTZ(6),
    "failure_reason" VARCHAR(500),
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_return_no_key" ON "return_requests"("return_no");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_idempotency_key_key" ON "return_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "return_requests_order_id_idx" ON "return_requests"("order_id");

-- CreateIndex
CREATE INDEX "return_requests_customer_id_created_at_id_idx" ON "return_requests"("customer_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "return_requests_branch_id_status_created_at_id_idx" ON "return_requests"("branch_id", "status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "return_requests_warehouse_id_idx" ON "return_requests"("warehouse_id");

-- CreateIndex
CREATE INDEX "return_items_order_item_id_idx" ON "return_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_items_return_request_id_order_item_id_key" ON "return_items"("return_request_id", "order_item_id");

-- CreateIndex
CREATE INDEX "return_status_history_request_id_idx" ON "return_status_history"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_status_history_return_request_id_sequence_no_key" ON "return_status_history"("return_request_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "return_status_history_return_request_id_idempotency_key_key" ON "return_status_history"("return_request_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_refund_no_key" ON "refunds"("refund_no");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

-- CreateIndex
CREATE INDEX "refunds_return_request_id_created_at_idx" ON "refunds"("return_request_id", "created_at");

-- CreateIndex
CREATE INDEX "refunds_payment_id_status_idx" ON "refunds"("payment_id", "status");

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_status_history" ADD CONSTRAINT "return_status_history_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECK: giá trị trạng thái phải khớp hằng số trong src/modules/return/return.constants.ts.
ALTER TABLE "return_requests"
  ADD CONSTRAINT "return_requests_status_check"
    CHECK ("status" IN ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CLOSED', 'CANCELLED')),
  ADD CONSTRAINT "return_requests_channel_check" CHECK ("channel" IN ('ACCOUNT', 'ADMIN')),
  ADD CONSTRAINT "return_requests_reason_code_check"
    CHECK ("reason_code" IN ('DEFECTIVE', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'WRONG_SIZE', 'CHANGED_MIND', 'OTHER')),
  ADD CONSTRAINT "return_requests_fault_check" CHECK ("fault" IS NULL OR "fault" IN ('SHOP', 'CUSTOMER')),
  ADD CONSTRAINT "return_requests_refund_cap_check" CHECK ("refund_cap" IS NULL OR "refund_cap" >= 0),
  -- Override hạn trả phải có cả người override lẫn lý do, không được nửa vời.
  ADD CONSTRAINT "return_requests_window_override_check"
    CHECK (("window_override_by" IS NULL) = ("window_override_note" IS NULL)),
  -- Đã duyệt thì phải biết lỗi thuộc về ai (D57 quyết định có hoàn phí giao hay không).
  ADD CONSTRAINT "return_requests_fault_decided_check"
    CHECK ("status" NOT IN ('APPROVED', 'RECEIVED', 'REFUNDED', 'CLOSED') OR "fault" IS NOT NULL),
  -- Đã nhận hàng thì trần tiền hoàn đã được chốt.
  ADD CONSTRAINT "return_requests_received_check"
    CHECK ("status" NOT IN ('RECEIVED', 'REFUNDED', 'CLOSED') OR ("received_at" IS NOT NULL AND "refund_cap" IS NOT NULL));

-- INVARIANT: tối đa một phiếu đang mở cho mỗi đơn; service kiểm trước, index này là chốt cuối
-- khi hai request tạo phiếu chạy song song.
CREATE UNIQUE INDEX "return_requests_one_open_per_order_key"
  ON "return_requests"("order_id")
  WHERE "status" NOT IN ('REJECTED', 'CANCELLED', 'CLOSED');

ALTER TABLE "return_items"
  ADD CONSTRAINT "return_items_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "return_items_condition_check"
    CHECK ("condition" IS NULL OR "condition" IN ('SELLABLE', 'DAMAGED', 'MISSING')),
  ADD CONSTRAINT "return_items_disposition_check"
    CHECK ("disposition" IS NULL OR "disposition" IN ('RESTOCK', 'HOLD', 'WRITE_OFF')),
  ADD CONSTRAINT "return_items_inspection_pair_check" CHECK (("condition" IS NULL) = ("disposition" IS NULL)),
  -- INVARIANT: chỉ hàng SELLABLE được nhập lại tồn bán; DAMAGED/MISSING không bao giờ tăng tồn.
  ADD CONSTRAINT "return_items_restock_check" CHECK (
    ("disposition" = 'RESTOCK' AND "condition" = 'SELLABLE' AND "restock_qty" = "quantity")
    OR (("disposition" IS NULL OR "disposition" <> 'RESTOCK') AND "restock_qty" = 0)
  ),
  ADD CONSTRAINT "return_items_refund_cap_check" CHECK ("refund_cap" IS NULL OR "refund_cap" >= 0);

ALTER TABLE "return_status_history"
  ADD CONSTRAINT "return_status_history_action_check" CHECK ("action" IN (
    'CREATE', 'APPROVE', 'REJECT', 'CANCEL', 'RECEIVE', 'REFUND_REQUEST', 'REFUND_CONFIRM', 'REFUND_FAIL', 'CLOSE'
  )),
  ADD CONSTRAINT "return_status_history_actor_type_check" CHECK ("actor_type" IN ('CUSTOMER', 'USER')),
  ADD CONSTRAINT "return_status_history_idempotency_pair_check"
    CHECK (("idempotency_key" IS NULL) = ("request_hash" IS NULL));

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_method_check" CHECK ("method" IN ('CASH', 'BANK_TRANSFER')),
  ADD CONSTRAINT "refunds_status_check" CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'FAILED')),
  ADD CONSTRAINT "refunds_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "refunds_currency_check" CHECK ("currency_code" = 'VND'),
  -- D58: chuyển khoản chỉ được đánh thành công khi đã có mã giao dịch để đối soát.
  ADD CONSTRAINT "refunds_bank_ref_check"
    CHECK ("status" <> 'SUCCEEDED' OR "method" <> 'BANK_TRANSFER' OR "external_ref" IS NOT NULL),
  ADD CONSTRAINT "refunds_processed_check"
    CHECK ("status" = 'PENDING' OR ("processed_by" IS NOT NULL AND "processed_at" IS NOT NULL)),
  ADD CONSTRAINT "refunds_failure_check" CHECK ("status" <> 'FAILED' OR "failure_reason" IS NOT NULL);

-- Một phiếu chỉ có một lượt hoàn đang chờ xác nhận: hai lượt PENDING song song là cách hoàn trùng.
CREATE UNIQUE INDEX "refunds_one_pending_per_return_key"
  ON "refunds"("return_request_id")
  WHERE "status" = 'PENDING';

-- Một mã giao dịch ngân hàng/biên nhận chỉ chứng minh cho MỘT lượt hoàn.
CREATE UNIQUE INDEX "refunds_method_external_ref_key"
  ON "refunds"("method", "external_ref")
  WHERE "external_ref" IS NOT NULL;

-- payments.status khai báo REFUNDED từ đầu nhưng CHECK chưa cho phép; hoàn toàn bộ số tiền đã thu
-- là lúc đầu tiên giá trị này được ghi.
ALTER TABLE "payments" DROP CONSTRAINT "payments_status_check";
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_check"
  CHECK ("status" IN ('PENDING', 'AWAITING_CONFIRMATION', 'NEED_REVIEW', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED'));

-- Quyền mới cho Return/Refund. Seed chỉ tự bù quyền cho OWNER; BRANCH_MANAGER và STAFF đã tồn tại
-- sẽ không nhận quyền mới nếu migration không cấp. Chỉ THÊM, không thu hồi quyền quản trị viên đã chỉnh.
INSERT INTO "permissions" ("code", "module", "action", "is_sensitive") VALUES
  ('return.create', 'Return', 'create', true),
  ('return.window.override', 'Return', 'override', true),
  ('payment.refund.request', 'Payment', 'refund_request', true),
  ('payment.refund.approve', 'Payment', 'refund_approve', true)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role.id, permission.id
FROM "roles" role
JOIN "permissions" permission ON (
  (role.code = 'OWNER' AND permission.code IN (
    'return.create', 'return.window.override', 'payment.refund.request', 'payment.refund.approve'))
  OR (role.code = 'BRANCH_MANAGER' AND permission.code IN (
    'return.create', 'payment.refund.request', 'payment.refund.approve'))
  OR (role.code = 'STAFF' AND permission.code IN ('return.create', 'payment.refund.request'))
)
WHERE role.is_system = true
ON CONFLICT DO NOTHING;
