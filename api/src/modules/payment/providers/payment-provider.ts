export type PaymentMethod = 'COD' | 'BANK_TRANSFER';

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
}

export abstract class PaymentProvider {
  abstract readonly method: PaymentMethod;
  abstract createInstruction(input: PaymentInstructionInput): PaymentInstruction;
}
