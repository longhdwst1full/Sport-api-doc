BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:remove_crawled_thumbnails'));

-- 596 ảnh trong thư viện là bản thu nhỏ 150x150 lọt vào khi crawl catalog — đúng một
-- ảnh mỗi sản phẩm. Chúng làm thư viện ảnh của Admin nhiễu và không dùng được để hiển
-- thị vì quá nhỏ.
--
-- Đã kiểm trước khi viết:
--   * 596/596 đang gắn vào sản phẩm qua `product_media`, nhưng KHÔNG ảnh nào là ảnh chính
--   * 0 ảnh dùng làm ảnh bìa bài viết hoặc ảnh danh mục
--   * 0 sản phẩm mất hết ảnh sau khi gỡ (mỗi sản phẩm còn 4 ảnh)
--
-- Lọc theo `secure_url` chứ không theo `width`/`height`: 1.360 ảnh crawl đều có kích
-- thước NULL vì nguồn không trả về.
CREATE TEMP TABLE crawled_thumbnails ON COMMIT DROP AS
SELECT id FROM public.media_assets WHERE secure_url LIKE '%150x150%';

DELETE FROM public.product_media
WHERE media_asset_id IN (SELECT id FROM crawled_thumbnails);

DELETE FROM public.media_assets
WHERE id IN (SELECT id FROM crawled_thumbnails);

COMMIT;
