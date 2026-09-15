import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const PERMISSIONS_KEY = 'required_permissions';

/** Tên extension trong OpenAPI; frontend đọc để canh UI theo đúng quyền backend yêu cầu. */
export const PERMISSIONS_OPENAPI_EXTENSION = 'x-required-permissions';

/**
 * CONTRACT: Danh sách quyền vừa là metadata cho `PermissionGuard` (ngữ nghĩa AND — phải có đủ),
 * vừa được xuất ra OpenAPI. Nhờ vậy frontend không phải chép tay permission code: nó đọc được
 * từ contract đã sinh, và quyền bị đổi ở backend sẽ hiện ra trong diff của contract.
 */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    ApiExtension(PERMISSIONS_OPENAPI_EXTENSION, permissions),
  ) as MethodDecorator & ClassDecorator;
