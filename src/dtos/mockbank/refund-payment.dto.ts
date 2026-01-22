import { IsNotEmpty, IsNumber, Matches, Max, Min } from 'class-validator';

export class CreateRefundPaymentRequestDto {
  @IsNotEmpty({ message: 'Amount is required' })
  @IsNumber()
  @Min(1, { message: 'Amount must be greater than 0' })
  @Max(9999, { message: 'Amount must be less than 9999' })
  amount!: number;

  @Matches(
    /^cap_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    {
      message:
        'Invalid authorizationId: Maybe it is not a valid UUID or not have a prefix cap_',
    },
  )
  captureId!: string;
}

export class CreateRefundPaymentResponseDto {
  amount!: number;
  captureId!: string;
  currency!: string;
  refundId!: string;
  refundedAt!: string;
  status!: 'refunded';
}

export class GetRefundPaymentResponseDto {
  amount!: number;
  captureId!: string;
  currency!: string;
  refundId!: string;
  refundedAt!: string;
  status!: string;
}
