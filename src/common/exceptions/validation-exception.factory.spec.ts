import type { ValidationError } from '@nestjs/common';
import { createValidationException } from './validation-exception.factory';

describe('createValidationException', () => {
  it('returns Vietnamese messages for nested class-validator errors', () => {
    const child = {
      property: 'email',
      constraints: { isEmail: 'email must be an email' },
      children: [],
    } as ValidationError;
    const root = { property: 'customer', children: [child] } as ValidationError;

    const response = createValidationException([root]).getResponse();

    expect(response).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu gửi lên không hợp lệ.',
      details: [
        {
          field: 'customer.email',
          code: 'ISEMAIL',
          message: 'Trường "customer.email": Email không đúng định dạng.',
        },
      ],
    });
  });
});
