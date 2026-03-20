import { PaymentReceipt } from '@domain/entities/payment.entity';

export class PaymentReceiptResponseSuccessDto {
  statusCode!: number;
  message!: string;
  data!: PaymentReceipt;
}
