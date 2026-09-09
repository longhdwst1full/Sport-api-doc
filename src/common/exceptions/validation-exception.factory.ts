import { BadRequestException, ValidationError } from '@nestjs/common';
import { validationMessageVi } from './client-error-message.vi';

interface ValidationDetail {
  field: string;
  code: string;
  message: string;
}

function collectValidationDetails(
  errors: ValidationError[],
  parentPath = '',
): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownDetails = Object.entries(error.constraints ?? {}).map(([code, message]) => ({
      field,
      code: code.toUpperCase(),
      message: validationMessageVi(code, message, field),
    }));
    return [...ownDetails, ...collectValidationDetails(error.children ?? [], field)];
  });
}

export function createValidationException(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Dữ liệu gửi lên không hợp lệ.',
    details: collectValidationDetails(errors),
  });
}
