import { PaymentStatus } from '@payments/domain/constants';

export enum CaptureResponseStatus {
  CAPTURED = PaymentStatus.CAPTURED,
}

export class CaptureResponseDto {
  amount!: number;
  authorizationId!: string;
  captureId!: string;
  capturedAt!: string;
  currency!: string;
  status!: PaymentStatus.CAPTURED;
}
