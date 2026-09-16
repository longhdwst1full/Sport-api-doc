import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { MailtrapClient } from 'mailtrap';
import { EmailClient, SendEmailInput, SendEmailResult } from './email.client';

export interface MailtrapEmailClientOptions {
  token: string;
  senderEmail: string;
  senderName: string;
  /** Khi bật, mọi email đều chuyển hướng về địa chỉ này — dùng cho môi trường không phải production. */
  redirectAllTo?: string;
}

@Injectable()
export class MailtrapEmailClient extends EmailClient {
  private readonly logger = new Logger(MailtrapEmailClient.name);
  private readonly client: MailtrapClient;

  constructor(private readonly options: MailtrapEmailClientOptions) {
    super();
    this.client = new MailtrapClient({ token: options.token });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    // SECURITY: ở môi trường không phải production, người nhận thật phải được thay bằng hộp thư
    // kiểm thử để không bao giờ gửi nhầm cho khách hàng từ dữ liệu seed hoặc bản sao database.
    const recipients = this.options.redirectAllTo
      ? [{ email: this.options.redirectAllTo }]
      : input.to.map(({ email, name }) => (name ? { email, name } : { email }));

    if (recipients.length === 0) {
      throw new ServiceUnavailableException('Email has no recipient');
    }

    try {
      const response = await this.client.send({
        from: { email: this.options.senderEmail, name: this.options.senderName },
        to: recipients,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.category ? { category: input.category } : {}),
      });

      return { provider: 'MAILTRAP', messageIds: response.message_ids ?? [] };
    } catch (error) {
      // PROVIDER: không log input.to hay nội dung email — đó là PII. Chỉ log subject và lỗi provider.
      this.logger.error({
        message: 'Mailtrap send failed',
        subject: input.subject,
        category: input.category,
        error: error instanceof Error ? error.message : 'unknown provider error',
      });
      throw new ServiceUnavailableException('Email provider rejected the message');
    }
  }
}
