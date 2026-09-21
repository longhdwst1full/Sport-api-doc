import { validate } from 'class-validator';
import { UpdateAdminCustomerDto } from './admin-customer.dto';

describe('UpdateAdminCustomerDto', () => {
  it('từ chối chuỗi rỗng vì email là bắt buộc trên hồ sơ khách', async () => {
    const input = Object.assign(new UpdateAdminCustomerDto(), {
      expectedVersion: 1,
      email: '',
    });

    const errors = await validate(input);
    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it('bỏ trống email nghĩa là giữ nguyên giá trị cũ, không phải xoá', async () => {
    const input = Object.assign(new UpdateAdminCustomerDto(), { expectedVersion: 1, name: 'Tên mới' });

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
