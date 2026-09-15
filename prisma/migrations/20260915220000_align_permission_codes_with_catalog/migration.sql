-- Align permission codes with document/05-rbac-permissions.csv.
-- The codes below were introduced ad hoc in the decorators and never matched the reviewed
-- RBAC catalog. role_permissions references permissions.id, so renaming the code preserves
-- every existing grant; no row is inserted or deleted.
UPDATE permissions SET code = 'cms.content.view', module = 'CMS' WHERE code = 'content.post.view';
UPDATE permissions SET code = 'cms.content.manage', module = 'CMS' WHERE code = 'content.post.manage';
UPDATE permissions SET code = 'catalog.review.moderate', module = 'Catalog' WHERE code = 'review.moderate';
