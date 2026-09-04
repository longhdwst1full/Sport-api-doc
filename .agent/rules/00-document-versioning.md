# Document versioning and change summary

> **Rule version:** 1.0.1
>
> **Last updated:** 2026-09-04
>
> **Change summary:** Bổ sung DBML vào nhóm định dạng máy đọc không được chèn metadata làm hỏng cú pháp.

Áp dụng cho mọi thay đổi trong `document/` và tài liệu nghiệp vụ/kỹ thuật ở root. Rule này chỉ quản lý metadata tài liệu; không thay thế rule riêng của Admin, Client hoặc API.

## Tài liệu viết tay

Mỗi Markdown hoặc tài liệu văn bản do con người duy trì phải có metadata gần đầu file:

```markdown
> **Document version:** 1.2.0
>
> **Last updated:** YYYY-MM-DD
>
> **Change summary:** Một câu mô tả phần đã sửa và lý do.
```

Mỗi lần sửa nội dung có ý nghĩa phải:

1. Tăng version; không giữ nguyên version của bản trước.
2. Cập nhật `Last updated` theo ngày làm việc thực tế.
3. Viết `Change summary` cụ thể, không dùng các câu chung như “update tài liệu”.
4. Thêm một dòng vào `Revision history` của chính tài liệu; không xóa lịch sử cũ.

```markdown
## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.2.0 | YYYY-MM-DD | Bổ sung rule khóa tài khoản sau 5 lần sai. | D38 / migration-id |
```

Nếu tài liệu cũ chưa có metadata, lần sửa tiếp theo bắt đầu ở `1.0.0` và ghi summary cho phạm vi thực sự thay đổi; không dựng lịch sử giả cho các bản cũ.

## Cách tăng version

- `MAJOR`: thay đổi scope, kiến trúc, model hoặc contract không tương thích với quyết định đã chốt.
- `MINOR`: thêm chức năng, bảng, luồng, rule hoặc một phần nội dung có ý nghĩa nhưng vẫn tương thích.
- `PATCH`: sửa diễn đạt, typo, link, evidence hoặc checklist mà không đổi hành vi/scope.

## Định dạng máy đọc và file sinh tự động

Không chèn metadata tùy ý làm hỏng cú pháp hoặc generated artifact:

- OpenAPI dùng `info.version`; summary nằm trong tài liệu sở hữu contract hoặc change log tương ứng.
- `04-table-catalog.csv`, `08-open-decisions.csv`, `11-model-change-log.json` giữ nguyên schema máy đọc; version/summary được ghi ở change-log entry liên quan.
- File DBML giữ cú pháp hợp lệ; version/summary được ghi trong comment DBML nếu parser hỗ trợ hoặc trong model change log sở hữu thay đổi.
- `DCTD-UTC-V1-database-model-review.xlsx` ghi version và summary trong sheet `Change Log`/Excel Note thông qua `docs:model:annotate`.
- Generated OpenAPI/SDK không chỉnh tay để thêm version hay summary.

## Handoff checklist

- Mọi tài liệu viết tay đã sửa có version mới, ngày cập nhật và summary.
- `Revision history` có dòng tương ứng và nguồn/Change ID khi có.
- Machine-readable/generated files được trace bằng cơ chế sở hữu của chúng.
- Summary mô tả đúng diff; version trong nội dung, filename và OpenAPI không mâu thuẫn.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-04 | Tạo chuẩn version, change summary và ngoại lệ cho tài liệu máy đọc/generated. | User requirement 2026-09-04 |
| 1.0.1 | 2026-09-04 | Bổ sung cách trace version/summary cho DBML. | Rule self-review |
