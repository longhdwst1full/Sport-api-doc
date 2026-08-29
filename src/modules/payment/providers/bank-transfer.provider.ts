import { Injectable } from '@nestjs/common';
import {
  PaymentInstruction,
  PaymentInstructionInput,
  PaymentProvider,
} from './payment-provider';

@Injectable()
export class BankTransferPaymentProvider extends PaymentProvider {
  readonly method = 'BANK_TRANSFER' as const;

  createInstruction(input: PaymentInstructionInput): PaymentInstruction {
    return {
      method: this.method,
      provider: 'MANUAL_BANK_TRANSFER',
      reference: input.paymentId,
      customerMessage: `Chuyển khoản đúng ${input.amountMinor} ${input.currency} với mã ${input.orderId}.`,
    };
  }
}
