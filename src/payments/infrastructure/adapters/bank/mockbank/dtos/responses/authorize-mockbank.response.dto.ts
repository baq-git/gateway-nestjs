import { PaymentStatus } from '@payments/domain/constants';

export class AuthorizationResponseDto {
  amount!: number;
  authorizationId!: string;
  createdAt!: string;
  currency!: string;
  expiresAt!: string;
  status!: PaymentStatus.AUTHORIZED;
}
