import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto, LoginDto, RegisterCustomerDto } from './auth.dto';

describe('Auth DTO whitespace normalization', () => {
  it('trims password fields before validation in every password flow', async () => {
    const login = plainToInstance(LoginDto, {
      identifier: 'admin@example.com',
      password: '  Aa@123456  ',
    });
    const registration = plainToInstance(RegisterCustomerDto, {
      displayName: 'Khách hàng',
      email: 'customer@example.com',
      password: '  Aa@123456  ',
    });
    const passwordChange = plainToInstance(ChangePasswordDto, {
      currentPassword: '  Aa@123456  ',
      newPassword: '  Bb@123456  ',
    });

    await expect(Promise.all([
      validate(login),
      validate(registration),
      validate(passwordChange),
    ])).resolves.toEqual([[], [], []]);
    expect(login.password).toBe('Aa@123456');
    expect(registration.password).toBe('Aa@123456');
    expect(passwordChange).toMatchObject({
      currentPassword: 'Aa@123456',
      newPassword: 'Bb@123456',
    });
  });

  it('trims both ends of the login identifier', () => {
    const dto = plainToInstance(LoginDto, {
      identifier: '  bootstrap-admin@example.invalid  ',
      password: 'Aa@123456',
    });

    expect(dto.identifier).toBe('bootstrap-admin@example.invalid');
  });
});
