import { ConflictException } from '@nestjs/common';
import { OrganizationService } from './organization.service';

describe('OrganizationService', () => {
  it('creates one branch and exactly one primary warehouse', () => {
    const service = new OrganizationService();
    const result = service.createBranch({
      code: 'CN-DN-01',
      name: 'Chi nhánh Đà Nẵng',
      address: {
        addressLine: '12 Bạch Đằng',
        district: 'Hải Châu',
        province: 'Đà Nẵng',
      },
      warehouse: { code: 'KHO-DN-01', name: 'Kho bán hàng Đà Nẵng' },
    });

    expect(result.warehouse.branchId).toBe(result.branch.id);
    expect(result.warehouse.isPrimary).toBe(true);
    expect(
      service.listWarehouses().items.filter((item) => item.branchId === result.branch.id),
    ).toHaveLength(1);
  });

  it('rejects duplicate branch and warehouse business codes', () => {
    const service = new OrganizationService();
    const input = {
      code: 'CN-DN-01',
      name: 'Chi nhánh Đà Nẵng',
      address: { addressLine: '12 Bạch Đằng', district: 'Hải Châu', province: 'Đà Nẵng' },
      warehouse: { code: 'KHO-DN-01', name: 'Kho bán hàng Đà Nẵng' },
    };
    service.createBranch(input);

    expect(() => service.createBranch(input)).toThrow(ConflictException);
  });
});
