import { describe, expect, it } from 'vitest';
import { ApiError } from './fetcher';
import { getApiErrorMessage, getApiFieldErrors } from './error';

describe('canonical API errors', () => {
  it('maps the generated v1 error envelope for form and notification use', () => {
    const error = new ApiError(400, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      requestId: 'request-123',
      details: [{ field: 'roleCode', code: 'IS_NOT_EMPTY', message: 'Role is required' }],
    });

    expect(getApiErrorMessage(error)).toContain('request-123');
    expect(getApiFieldErrors(error)).toEqual({ roleCode: 'Role is required' });
  });
});
