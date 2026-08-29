import { Injectable } from '@nestjs/common';
import {
  PaymentInstruction,
  PaymentInstructionInput,
  PaymentProvider,
} from './payment-provider';

@Injectable()
export class CodPaymentProvider extends PaymentProvider {
  readonly method = 'COD' as const;

  createInstruction(input: PaymentInstructionInput): PaymentInstruction {
    return {
      method: this.method,
      provider: 'INTERNAL_COD',
      reference: input.paymentId,
      customerMessage: 'Thanh toán một lần khi nhận hàng.',
    };
  }
}
