export type PaymentMethod = 'COD' | 'BANK_TRANSFER' | 'VNPAY';

export interface PaymentInstructionInput {
  paymentId: string;
  orderId: string;
  amountMinor: number;
  currency: 'VND';
}

export interface PaymentInstruction {
  method: PaymentMethod;
  provider: string;
  reference: string;
  customerMessage: string;
  /**
   * Cổng thanh toán online trả về link để khách bấm sang. Chuyển khoản tay và COD
   * không có link nên trường này để trống.
   */
  redirectUrl?: string;
}

export abstract class PaymentProvider {
  abstract readonly method: PaymentMethod;
  abstract createInstruction(input: PaymentInstructionInput): PaymentInstruction;
}
