-- Đánh giá hiển thị ngay, không chờ duyệt.
--
-- Trước đây đánh giá mới vào ở PENDING và Storefront chỉ hiện APPROVED, nghĩa là khách viết xong
-- phải chờ Admin bấm duyệt mới thấy. Đổi mặc định sang APPROVED: kiểm duyệt thành việc hậu kiểm —
-- Admin vẫn gỡ được nội dung xấu bằng REJECTED, nhưng không còn chặn ở cửa vào.
ALTER TABLE product_reviews ALTER COLUMN status SET DEFAULT 'APPROVED';

-- Không còn trạng thái chờ: những dòng đang treo phải được hiện lên thay vì kẹt vô thời hạn.
UPDATE product_reviews SET status = 'APPROVED' WHERE status = 'PENDING';
