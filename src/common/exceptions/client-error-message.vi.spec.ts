import { clientMessageVi, validationMessageVi } from './client-error-message.vi';

describe('Vietnamese client error messages', () => {
  it('translates known authentication messages', () => {
    expect(clientMessageVi('Email/phone or password is incorrect', 401)).toBe(
      'Email, số điện thoại hoặc mật khẩu không đúng.',
    );
  });

  it('uses a safe Vietnamese status fallback for unknown English messages', () => {
    expect(clientMessageVi('Provider returned an undocumented error', 503)).toBe(
      'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
    );
  });

  it('keeps an existing Vietnamese business message', () => {
    expect(clientMessageVi('Tài khoản đã bị khóa.', 401)).toBe('Tài khoản đã bị khóa.');
  });

  it('translates validation details without exposing class-validator prose', () => {
    expect(validationMessageVi('max', 'limit must not be greater than 50', 'limit')).toBe(
      'Trường "limit": Giá trị vượt quá giới hạn tối đa.',
    );
  });
});
