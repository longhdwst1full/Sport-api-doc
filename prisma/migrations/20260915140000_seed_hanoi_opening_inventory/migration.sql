BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:seed_hanoi_opening_inventory'));

-- Mở sổ tồn kho cho kho Hà Nội với toàn bộ SKU đang bán.
--
-- `on_hand = 0` là có chủ ý: số lượng thật do cửa hàng nhập bằng phiếu điều chỉnh
-- tồn, không seed bừa con số kho. Nhờ có dòng tồn, mỗi SKU mới có chỗ để ghi nhận
-- khi nhập hàng, và báo cáo mới biết SKU nào cần nhập.
--
-- `reorder_point = 5`: mọi SKU lập tức nằm dưới ngưỡng, nên màn Dashboard liệt kê
-- đúng danh sách cần nhập thay vì im lặng.
--
-- Không ghi bút toán kho: số lượng bằng 0 nên không có gì để đối soát.
INSERT INTO public.inventory_balances (warehouse_id, product_variant_id, on_hand, reserved, reorder_point, updated_at)
SELECT warehouse.id, variant.id, 0, 0, 5, CURRENT_TIMESTAMP
FROM public.warehouses warehouse
JOIN public.branches branch ON branch.id = warehouse.branch_id AND branch.code = 'CN-HN-01'
CROSS JOIN public.product_variants variant
JOIN public.products product ON product.id = variant.product_id
WHERE warehouse.status = 'ACTIVE'
  AND variant.status = 'ACTIVE'
  AND product.status = 'PUBLISHED'
ON CONFLICT (warehouse_id, product_variant_id) DO NOTHING;

COMMIT;
