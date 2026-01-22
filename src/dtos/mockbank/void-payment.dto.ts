import { IsNotEmpty, Matches } from 'class-validator';

export class CreateVoidPaymentRequestDto {
  @IsNotEmpty({ message: 'Authorization ID is required' })
  @Matches(
    /auth_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    {
      message: 'Invalid authorization ID',
    },
  )
  authorizationId!: string;
}

export class CreateVoidPaymentResponseDto {
  authorizationId!: string;
  status!: 'voided';
  voidId!: string;
  voidedAt!: string;
}
