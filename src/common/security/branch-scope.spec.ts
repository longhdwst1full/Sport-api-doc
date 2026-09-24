import { ForbiddenException } from '@nestjs/common';
import type { AuthPrincipal } from '../../modules/auth/auth.types';
import { ScopeType } from '../../modules/iam/iam.types';
import {
  branchScopeWhere,
  customerBranchScopeWhere,
  hasGlobalScope,
  requireVisibleBranchIds,
  visibleBranchIds,
  warehouseBranchScopeWhere,
} from './branch-scope';

function principal(scopes: AuthPrincipal['scopes']): AuthPrincipal {
  return {
    userId: '1',
    sessionId: 's',
    displayName: 'Tester',
    permissionVersion: '1',
    permissions: [],
    scopes,
    mustChangePassword: false,
  };
}

const global = principal([{ type: ScopeType.GLOBAL }]);
const hanoi = principal([{ type: ScopeType.BRANCH, branchId: '2' }]);
const twoBranches = principal([
  { type: ScopeType.BRANCH, branchId: '2' },
  { type: ScopeType.BRANCH, branchId: '3' },
]);
const noScope = principal([]);

describe('visibleBranchIds', () => {
  it('GLOBAL không áp bộ lọc nào', () => {
    expect(visibleBranchIds(global)).toBeUndefined();
    expect(hasGlobalScope(global)).toBe(true);
  });

  it('trả đúng các chi nhánh được gán', () => {
    expect(visibleBranchIds(twoBranches)).toEqual([2n, 3n]);
  });

  it('bỏ trùng lặp khi một chi nhánh được gán nhiều lần', () => {
    const duplicated = principal([
      { type: ScopeType.BRANCH, branchId: '2' },
      { type: ScopeType.BRANCH, branchId: '2' },
    ]);

    expect(visibleBranchIds(duplicated)).toEqual([2n]);
  });

  /**
   * SECURITY: không chi nhánh nào thì bộ lọc phải khớp KHÔNG bản ghi nào. Trả `undefined` ở đây
   * sẽ bị hiểu là GLOBAL và mở toàn bộ dữ liệu — đó là kiểu hỏng nguy hiểm nhất của hàm này.
   */
  it('không có chi nhánh nào thì trả mảng rỗng, KHÔNG phải undefined', () => {
    expect(visibleBranchIds(noScope)).toEqual([]);
    expect(visibleBranchIds(noScope)).not.toBeUndefined();
  });

  it('scope BRANCH thiếu branchId bị bỏ qua, không biến thành GLOBAL', () => {
    const broken = principal([{ type: ScopeType.BRANCH } as AuthPrincipal['scopes'][number]]);

    expect(visibleBranchIds(broken)).toEqual([]);
  });
});

describe('requireVisibleBranchIds', () => {
  it('từ chối tài khoản chưa được gán chi nhánh', () => {
    expect(() => requireVisibleBranchIds(noScope)).toThrow(ForbiddenException);
  });

  it('GLOBAL và tài khoản có chi nhánh đi qua bình thường', () => {
    expect(requireVisibleBranchIds(global)).toBeUndefined();
    expect(requireVisibleBranchIds(hanoi)).toEqual([2n]);
  });
});

describe('bộ lọc theo từng hình dạng bảng', () => {
  it('bảng có cột branch_id trực tiếp', () => {
    expect(branchScopeWhere(hanoi)).toEqual({ branchId: { in: [2n] } });
    expect(branchScopeWhere(global)).toEqual({});
  });

  /** Hồi quy: từng đem branch id so với `warehouseId` — hai cột khác nhau. */
  it('bảng gắn chi nhánh qua kho lọc bằng quan hệ warehouse.branchId', () => {
    expect(warehouseBranchScopeWhere(hanoi)).toEqual({ warehouse: { branchId: { in: [2n] } } });
    expect(warehouseBranchScopeWhere(hanoi)).not.toHaveProperty('warehouseId');
    expect(warehouseBranchScopeWhere(global)).toEqual({});
  });

  it('khách hàng thuộc chi nhánh khi đã từng đặt đơn ở đó', () => {
    expect(customerBranchScopeWhere(twoBranches)).toEqual({
      orders: { some: { branchId: { in: [2n, 3n] } } },
    });
    expect(customerBranchScopeWhere(global)).toEqual({});
  });

  /** Tài khoản không chi nhánh: mọi bộ lọc phải khớp rỗng, không được mở toàn bộ. */
  it('tài khoản không chi nhánh thì mọi bộ lọc đều khớp rỗng', () => {
    expect(branchScopeWhere(noScope)).toEqual({ branchId: { in: [] } });
    expect(warehouseBranchScopeWhere(noScope)).toEqual({ warehouse: { branchId: { in: [] } } });
    expect(customerBranchScopeWhere(noScope)).toEqual({ orders: { some: { branchId: { in: [] } } } });
  });
});

/**
 * Hai hành vi khi tài khoản chưa được gán chi nhánh đang cùng tồn tại trong hệ thống. Cả hai đều
 * fail-closed; tuỳ chọn `strict` giữ nguyên hành vi từng chỗ và làm chỗ lệch tra được bằng grep.
 */
describe('tuỳ chọn strict', () => {
  it('mặc định trả bộ lọc khớp rỗng', () => {
    expect(branchScopeWhere(noScope)).toEqual({ branchId: { in: [] } });
    expect(warehouseBranchScopeWhere(noScope)).toEqual({ warehouse: { branchId: { in: [] } } });
  });

  it('strict thì từ chối thẳng', () => {
    expect(() => branchScopeWhere(noScope, { strict: true })).toThrow(ForbiddenException);
    expect(() => warehouseBranchScopeWhere(noScope, { strict: true })).toThrow(ForbiddenException);
    expect(() => customerBranchScopeWhere(noScope, { strict: true })).toThrow(ForbiddenException);
  });

  it('strict không ảnh hưởng tài khoản hợp lệ', () => {
    expect(branchScopeWhere(hanoi, { strict: true })).toEqual({ branchId: { in: [2n] } });
    expect(branchScopeWhere(global, { strict: true })).toEqual({});
  });
});
