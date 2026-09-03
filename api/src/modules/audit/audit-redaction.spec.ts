import { redactAuditValue } from './audit-redaction';

describe('redactAuditValue', () => {
  it('redacts nested credentials and masks contact details', () => {
    expect(redactAuditValue({
      password: 'Aa@123456',
      nested: { refreshToken: 'secret', email: 'long@example.com', phone: '+84912345678' },
    })).toEqual({
      password: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', email: 'lo***@example.com', phone: '***5678' },
    });
  });
});
