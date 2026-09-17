-- Cờ hiển thị tách khỏi trạng thái vòng đời.
--
-- `status` vẫn giữ vòng đời nghiệp vụ (DRAFT/PUBLISHED/ARCHIVED). `is_published` trả lời một câu
-- hỏi khác: bản ghi này có được hiện trên website hay không. Tách ra để ẩn tạm một sản phẩm đang
-- bán không phải đẩy nó về DRAFT — việc đó làm mất dấu nó đã từng được duyệt.
ALTER TABLE products ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill theo đúng trạng thái đang có để hành vi hiển thị không đổi sau khi triển khai.
UPDATE products SET is_published = (status = 'PUBLISHED');
UPDATE posts SET is_published = (status = 'PUBLISHED');

-- Truy vấn Storefront lọc theo cờ này nên cần index đi kèm trạng thái.
CREATE INDEX products_is_published_idx ON products (is_published, status);
CREATE INDEX posts_is_published_idx ON posts (is_published, published_at DESC);
