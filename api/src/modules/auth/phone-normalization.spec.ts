import {
  InvalidVietnamesePhoneNumberError,
  normalizeVietnamesePhone,
} from './phone-normalization';

describe('normalizeVietnamesePhone', () => {
  it.each([
    ['0912 345 678', '+84912345678'],
    ['0912.345.678', '+84912345678'],
    ['+84 912 345 678', '+84912345678'],
    ['84912345678', '+84912345678'],
    ['0084912345678', '+84912345678'],
    ['+84 (0) 912-345-678', '+84912345678'],
    ['028 3822 2222', '+842838222222'],
  ])('normalizes %s to E.164', (input, expected) => {
    expect(normalizeVietnamesePhone(input)).toBe(expected);
  });

  it.each(['12345', '+12025550123', '0162 123 4567', 'not-a-phone']) (
    'rejects invalid or non-Vietnamese input %s',
    (input) => {
      expect(() => normalizeVietnamesePhone(input)).toThrow(
        InvalidVietnamesePhoneNumberError,
      );
    },
  );
});
