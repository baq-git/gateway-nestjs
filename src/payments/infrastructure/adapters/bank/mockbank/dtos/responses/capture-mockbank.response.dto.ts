export enum CaptureResponseStatus {
  CAPTURED = 'captured',
}

export class CaptureResponseDto {
  amount!: number;
  authorizationId!: string;
  captureId!: string;
  capturedAt!: string;
  currency!: string;
  status!: CaptureResponseStatus;
}
