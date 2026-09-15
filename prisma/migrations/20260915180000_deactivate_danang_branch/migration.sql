BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:deactivate_danang_branch'));

-- Cửa hàng chỉ vận hành hai chi nhánh: Hồ Chí Minh và Hà Nội. Chi nhánh Đà Nẵng là
-- dữ liệu dựng sẵn từ giai đoạn demo, đã kiểm trước khi viết: 0 đơn, 0 phiên checkout,
-- 0 giỏ, 0 gán quyền, 0 biểu giá vận chuyển, 0 số dư tồn kho.
-- Ngừng hoạt động thay vì xoá cứng: chi nhánh và kho là thực thể được tham chiếu từ
-- sổ cái chỉ-ghi-thêm (inventory_movements, audit_logs), xoá cứng sẽ làm mất khả năng
-- đọc lại lịch sử nếu sau này phát sinh tham chiếu.
UPDATE public.warehouses
SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP
WHERE branch_id = (SELECT id FROM public.branches WHERE code = 'CN-DN-01')
  AND status <> 'INACTIVE';

UPDATE public.branches
SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP
WHERE code = 'CN-DN-01' AND status <> 'INACTIVE';

COMMIT;
