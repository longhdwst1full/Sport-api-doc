import { validate } from 'class-validator';
import { UpdateAdminCustomerDto } from './admin-customer.dto';

describe('UpdateAdminCustomerDto', () => {
  it('cho phép chuỗi rỗng để xoá email khi service vẫn kiểm tra kênh liên hệ còn lại', async () => {
    const input = Object.assign(new UpdateAdminCustomerDto(), {
      expectedVersion: 1,
      email: '',
    });

    await expect(validate(input)).resolves.toHaveLength(0);
  });

  it('từ chối email không hợp lệ khi có giá trị', async () => {
    const input = Object.assign(new UpdateAdminCustomerDto(), {
      expectedVersion: 1,
      email: 'khong-phai-email',
    });

    const errors = await validate(input);
    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });
});
