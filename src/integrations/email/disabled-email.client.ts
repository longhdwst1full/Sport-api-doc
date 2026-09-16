import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EmailClient, SendEmailInput, SendEmailResult } from './email.client';

/**
 * PROVIDER: Dùng khi chưa cấu hình email. Ném lỗi rõ ràng thay vì im lặng nuốt mất email,
 * để môi trường thiếu cấu hình lộ ra ngay chứ không giả vờ đã gửi.
 */
@Injectable()
export class DisabledEmailClient extends EmailClient {
  send(input: SendEmailInput): Promise<SendEmailResult> {
    void input;
    throw new ServiceUnavailableException('Email provider is not configured');
  }
}
