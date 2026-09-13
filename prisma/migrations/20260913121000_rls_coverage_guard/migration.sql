BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:rls_coverage_guard'));

-- Migration 20260909010000 duyệt qua CÁC BẢNG TỒN TẠI TẠI THỜI ĐIỂM ĐÓ để bật RLS.
-- Mọi bảng tạo sau (orders, payments, fulfillments và các bảng con) không được
-- duyệt qua, nên lớp phòng thủ thứ hai bị hụt đúng ở nhóm tiền và PII.
--
-- Lớp phòng thủ chính (REVOKE + ALTER DEFAULT PRIVILEGES cho anon/authenticated)
-- vẫn phủ bảng mới, nên đây là vá chiều sâu phòng thủ chứ không phải vá lỗ hổng
-- đang bị khai thác.
DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT format('%I.%I', namespace_row.nspname, table_row.relname) AS qualified_name
    FROM pg_class table_row
    JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND table_row.relkind = 'r'
      AND NOT table_row.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_record.qualified_name);
  END LOOP;
END;
$$;

-- Thu hồi lại quyền cho các bảng đã tạo sau lần hardening trước.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Chốt chặn: nếu còn bảng nào chưa bật RLS thì migration fail thay vì âm thầm bỏ qua.
-- Wave sau thêm bảng mà quên bật sẽ bị bắt ở đây, không phải ở lần audit kế tiếp.
DO $$
DECLARE
  uncovered text;
BEGIN
  SELECT string_agg(table_row.relname, ', ' ORDER BY table_row.relname)
  INTO uncovered
  FROM pg_class table_row
  JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
  WHERE namespace_row.nspname = 'public'
    AND table_row.relkind = 'r'
    AND NOT table_row.relrowsecurity;

  IF uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'Còn bảng public chưa bật RLS: %', uncovered;
  END IF;
END;
$$;

COMMIT;
