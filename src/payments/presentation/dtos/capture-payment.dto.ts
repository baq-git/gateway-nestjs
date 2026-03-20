import { IsNotEmpty, IsNumber, Matches, Max, Min } from 'class-validator';

export class GetCapturePaymentRequestDto {
  @Matches(
    /^cap_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    {
      message:
        'Invalid authorizationId: Maybe it is not a valid UUID or not have a prefix cap_',
    },
  )
  captureId!: string;
}

export class CreateCapturePaymentRequestDto {
  @IsNotEmpty({ message: 'Amount is required' })
  @IsNumber()
  @Min(1, { message: 'Amount must be greater than 0' })
  @Max(9999, { message: 'Amount must be less than 9999' })
  amount!: number;

  @IsNotEmpty({ message: 'Authorization ID is required' })
  @Matches(
    /^auth_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    {
      message:
        'Invalid authorizationId: Maybe it is not a valid UUID or not have a prefix auth_',
    },
  )
  authorizationId!: string;
}

export class GetCapturePaymentResponseDto {
  amount!: string;
  authorizationId!: string;
  captureId!: string;
  capturedAt!: Date;
  currency!: string;
  status!: string;
}

export class CreateCapturePaymentResponseDto {
  amount!: number;
  authorizationId!: string;
  captureId!: string;
  capturedAt!: Date;
  currency!: string;
  status!: 'captured';
}
