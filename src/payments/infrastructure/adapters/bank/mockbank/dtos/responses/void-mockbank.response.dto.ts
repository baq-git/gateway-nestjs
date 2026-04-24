import { PaymentStatus } from '@payments/domain/constants';

export class VoidResponseDto {
  authorizationId!: string;
  status!: PaymentStatus.VOIDED;
  voidId!: string;
  voidedAt!: string;
}
