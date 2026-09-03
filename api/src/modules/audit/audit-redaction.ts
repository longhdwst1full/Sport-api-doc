const SENSITIVE_KEY = /(password|token|secret|authorization|cookie|credential|api.?key|hash)/i;

function maskEmail(value: string): string {
  const [local = '', domain = ''] = value.split('@');
  return domain ? `${local.slice(0, 2)}***@${domain}` : '[MASKED]';
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `***${digits.slice(-4)}` : '[MASKED]';
}

export function redactAuditValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactAuditValue(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactAuditValue(childValue, childKey),
      ]),
    );
  }
  if (typeof value === 'string' && /email/i.test(key)) return maskEmail(value);
  if (typeof value === 'string' && /phone/i.test(key)) return maskPhone(value);
  return value;
}
