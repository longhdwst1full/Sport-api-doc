import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export class InvalidVietnamesePhoneNumberError extends Error {
  constructor() {
    super('Vietnamese phone number is invalid');
    this.name = 'InvalidVietnamesePhoneNumberError';
  }
}

export function normalizeVietnamesePhone(value: string): string {
  let candidate = value.trim().replace(/[\s.()-]/g, '');
  if (candidate.startsWith('00')) candidate = `+${candidate.slice(2)}`;
  if (/^84\d+$/.test(candidate)) candidate = `+${candidate}`;
  candidate = candidate.replace(/^\+840/, '+84');

  const phone = parsePhoneNumberFromString(candidate, 'VN');
  if (!phone || phone.country !== 'VN' || !phone.isValid()) {
    throw new InvalidVietnamesePhoneNumberError();
  }
  return phone.number;
}
