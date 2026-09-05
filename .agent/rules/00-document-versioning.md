# API document versioning and traceability

> **Rule version:** 2.0.0
>
> **Last updated:** 2026-09-05
>
> **Change summary:** Tách rule về API repository và giữ trace riêng cho database/OpenAPI artifacts.

Áp dụng cho `document/`, `_features/`, `_plans/`, `_prompts/` và tài liệu kỹ thuật API. Markdown viết tay phải có document version, ngày cập nhật, change summary và revision history. Tăng MAJOR khi đổi scope/schema/contract không tương thích, MINOR khi thêm capability, PATCH khi chỉ sửa evidence/diễn đạt.

Không sửa metadata trực tiếp trong generated OpenAPI/SDK. CSV/JSON/DBML/XLSX phải dùng model change log và `docs:model:annotate`; mọi DB/API change phải tuân theo `.agent/rules/08-db-api-document-traceability.md`.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 2.0.0 | 2026-09-05 | Tách khỏi root và giới hạn cho tài liệu DB/API. | Repository tooling split |
