import { ForbiddenException } from '@nestjs/common';

import { toDatabaseId } from '../identifiers/entity-id';
import type { AuthPrincipal } from '../../modules/auth/auth.types';
import { ScopeType } from '../../modules/iam/iam.types';

/**
 * Phạm vi dữ liệu theo chi nhánh — **một nguồn định nghĩa duy nhất**.
 *
 * Trước đây quy tắc này được chép lại trong 11 hàm rải khắp 9 service. Hai hệ quả đã xảy ra thật:
 *
 * 1. Một chỗ quên áp scope thì rò rỉ chéo chi nhánh mà không có gì bắt được — `getAdminReportOverview`
 *    từng đếm khách trên toàn bảng, nên quản lý chi nhánh thấy tổng số khách toàn hệ thống.
 * 2. Các bản sao lệch nhau: tài khoản KHÔNG có chi nhánh nào thì `order`/`payment`/`iam` ném 403,
 *    còn `reporting`/`customer` trả danh sách rỗng. Cả hai đều đóng, nhưng hai kiểu đóng khác nhau.
 *
 * SECURITY: mọi nhánh ở đây đều fail-closed. `undefined` nghĩa là phạm vi GLOBAL — và chỉ khi
 * principal thật sự có scope GLOBAL, không bao giờ là giá trị mặc định khi thiếu dữ liệu.
 */

/**
 * Danh sách chi nhánh principal được nhìn thấy.
 *
 * `undefined` = GLOBAL, không áp bộ lọc nào. Mảng rỗng = không có chi nhánh nào, và bộ lọc
 * `{ in: [] }` sinh ra từ nó khớp **không** bản ghi nào — đó là hành vi mong muốn.
 */
export function visibleBranchIds(actor: AuthPrincipal): bigint[] | undefined {
  if (hasGlobalScope(actor)) return undefined;
  return [
    ...new Set(
      actor.scopes.flatMap(({ type, branchId }) =>
        type === ScopeType.BRANCH && branchId ? [branchId] : [],
      ),
    ),
  ].map((branchId) => toDatabaseId(branchId));
}

export function hasGlobalScope(actor: AuthPrincipal): boolean {
  return actor.scopes.some(({ type }) => type === ScopeType.GLOBAL);
}

/**
 * Như `visibleBranchIds` nhưng từ chối thẳng khi tài khoản chưa được gán chi nhánh nào.
 *
 * Dùng cho các luồng thao tác (đặt đơn, xác nhận thanh toán): ở đó "không có phạm vi" là lỗi cấu
 * hình tài khoản, và trả danh sách rỗng sẽ biến nó thành một màn hình trống không ai hiểu vì sao.
 */
export function requireVisibleBranchIds(actor: AuthPrincipal): bigint[] | undefined {
  const branchIds = visibleBranchIds(actor);
  if (branchIds && branchIds.length === 0) {
    throw new ForbiddenException('Tài khoản chưa được gán phạm vi chi nhánh');
  }
  return branchIds;
}

/**
 * `strict: true` → tài khoản chưa được gán chi nhánh nào bị từ chối thẳng (403) thay vì nhận danh
 * sách rỗng.
 *
 * Hai hành vi này đang cùng tồn tại trong hệ thống và **cả hai đều fail-closed**: màn thao tác
 * (đặt đơn, xác nhận thanh toán, tra tồn kho) trả 403 vì "không có phạm vi" là lỗi cấu hình tài
 * khoản; màn tổng hợp (báo cáo, danh sách khách) trả rỗng. Tuỳ chọn này giữ nguyên hành vi từng
 * chỗ và làm chỗ lệch nhau tra được bằng một lần grep, thay vì nằm rải trong 11 bản sao.
 */
export interface BranchScopeOptions {
  strict?: boolean;
}

function resolve(actor: AuthPrincipal, options?: BranchScopeOptions): bigint[] | undefined {
  return options?.strict ? requireVisibleBranchIds(actor) : visibleBranchIds(actor);
}

/** Bộ lọc cho bảng có cột `branch_id` trực tiếp: orders, payments, fulfillments, checkout_sessions. */
export function branchScopeWhere(
  actor: AuthPrincipal,
  options?: BranchScopeOptions,
): { branchId?: { in: bigint[] } } {
  const branchIds = resolve(actor, options);
  return branchIds ? { branchId: { in: branchIds } } : {};
}

/**
 * Bộ lọc cho bảng gắn chi nhánh QUA ĐƠN HÀNG: payments, fulfillments.
 *
 * Hai bảng này không có cột `branch_id` riêng; chi nhánh là của đơn mà chúng thuộc về.
 */
export function orderBranchScopeWhere(
  actor: AuthPrincipal,
  options?: BranchScopeOptions,
): { order?: { branchId: { in: bigint[] } } } {
  const branchIds = resolve(actor, options);
  return branchIds ? { order: { branchId: { in: branchIds } } } : {};
}

/**
 * Bộ lọc cho bảng gắn chi nhánh QUA KHO: inventory_balances, inventory_movements.
 *
 * Lọc qua quan hệ `warehouse.branchId`, KHÔNG phải `warehouseId`. `Warehouse.id` và
 * `Warehouse.branch_id` là hai cột khác nhau; đem branch id so với warehouse id sẽ trả về kho của
 * chi nhánh khác hoặc rỗng — đây là một lỗi đã xảy ra và đã phải sửa.
 */
export function warehouseBranchScopeWhere(
  actor: AuthPrincipal,
  options?: BranchScopeOptions,
): { warehouse?: { branchId: { in: bigint[] } } } {
  const branchIds = resolve(actor, options);
  return branchIds ? { warehouse: { branchId: { in: branchIds } } } : {};
}

/**
 * Bộ lọc cho khách hàng: khách thuộc phạm vi một chi nhánh khi đã từng đặt đơn ở chi nhánh đó.
 *
 * Quy tắc này phải giống hệt ở danh sách khách và ở mọi phép đếm khách; lệch nhau là rò rỉ quy mô
 * dữ liệu của chi nhánh khác qua một con số tổng.
 */
export function customerBranchScopeWhere(
  actor: AuthPrincipal,
  options?: BranchScopeOptions,
): { orders?: { some: { branchId: { in: bigint[] } } } } {
  const branchIds = resolve(actor, options);
  return branchIds ? { orders: { some: { branchId: { in: branchIds } } } } : {};
}
