import { IsEnum, IsString } from 'class-validator';

export enum MockbankErrorCode {
  ALREADY_CAPTURED = 'already_captured',
  ALREADY_REFUNDED = 'already_refunded',
  ALREADY_VOIDED = 'already_voided',
  AMOUNT_MISMATCH = 'amount_mismatch',
  AUTHORIZATION_ALREADY_USED = 'authorization_already_used',
  AUTHORIZATION_EXPIRED = 'authorization_expired',
  AUTHORIZATION_NOT_FOUND = 'authorization_not_found',
  CAPTURE_NOT_FOUND = 'capture_not_found',
  CARD_EXPIRED = 'card_expired',
  INSUFFICIENT_FUNDS = 'insufficient_funds',
  INTERNAL_ERROR = 'internal_error',
  INVALID_AMOUNT = 'invalid_amount',
  INVALID_CARD = 'invalid_card',
  INVALID_CVV = 'invalid_cvv',
  MISSING_IDEMPOTENCY_KEY = 'missing_idempotency_key',
  NOT_FOUND = 'not_found',
  REFUND_NOT_FOUND = 'refund_not_found',
}

export class MockbankErrorResponseDto {
  @IsEnum(MockbankErrorCode)
  error!: MockbankErrorCode;

  @IsString()
  message!: string;
}
