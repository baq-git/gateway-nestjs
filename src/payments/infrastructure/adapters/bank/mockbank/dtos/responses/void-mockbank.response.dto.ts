export enum VoidResponseStatus {
  VOIDED = 'voided',
}

export class VoidResponseDto {
  authorizationId!: string;
  status!: VoidResponseStatus;
  voidId!: string;
  voidedAt!: string;
}
