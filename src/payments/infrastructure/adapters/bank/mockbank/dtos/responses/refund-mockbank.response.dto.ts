import { PaymentStatus } from '@payments/domain/constants';

export class RefundResponseDto {
  amount!: number;
  captureId!: string;
  currency!: string;
  refundId!: string;
  refundedAt!: string;
  status!: PaymentStatus.REFUNDED;
}
