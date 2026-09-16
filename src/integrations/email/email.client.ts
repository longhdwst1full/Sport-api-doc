export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailInput {
  to: EmailRecipient[];
  subject: string;
  /** Bắt buộc: bản text luôn phải có để email đọc được khi client chặn HTML. */
  text: string;
  html?: string;
  /** Nhãn phân loại của provider, dùng để lọc trong Mailtrap email logs. */
  category?: string;
}

export interface SendEmailResult {
  provider: 'MAILTRAP';
  /** ID provider trả về cho từng recipient; dùng để đối chiếu với email logs. */
  messageIds: string[];
}

/**
 * PROVIDER: Cổng gửi email của hệ thống. Module nghiệp vụ chỉ phụ thuộc lớp trừu tượng này,
 * không import SDK provider, để đổi nhà cung cấp không phải sửa code nghiệp vụ.
 */
export abstract class EmailClient {
  abstract send(input: SendEmailInput): Promise<SendEmailResult>;
}
