import { PaymentReceipt } from 'src/payment-receipt/payment-receipt';

export class PaymentReceiptResponseSuccessDto {
  statusCode!: number;
  message!: string;
  data!: PaymentReceipt;
}
