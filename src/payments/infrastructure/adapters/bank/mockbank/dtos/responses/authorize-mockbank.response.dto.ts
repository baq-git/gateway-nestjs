export enum CreateAuthorizationResponseStatus {
  APPROVED = 'approved',
}

export class AuthorizationResponseDto {
  amount!: number;
  authorizationId!: string;
  createdAt!: string;
  currency!: string;
  expiresAt!: string;
  status!: CreateAuthorizationResponseStatus;
}
