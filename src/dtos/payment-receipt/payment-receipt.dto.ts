export class PaymentReceiptResponseSuccessDto {
  statusCode!: number;
  message!: string;
  data!: {
    paymentReferenceId: string;
    paymentState: string;
    currency: string;
    amount: number;
    pendingAt: Date;
    authorizedAt: Date;
    capturedAt: Date;
    refundedAt: Date;
    createAt: Date;
    voidedAt: Date;
  };
}
