export enum RefundResponseStatus {
  REFUNDED = 'refunded',
}

export class RefundResponseDto {
  amount!: number;
  captureId!: string;
  currency!: string;
  refundId!: string;
  refundedAt!: string;
  status!: RefundResponseStatus;
}
