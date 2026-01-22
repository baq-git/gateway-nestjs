export enum PaymentStatus {
  Pending = 'PENDING',
  Authorized = 'AUTHORIZED',
  Captured = 'CAPTURED',
  Refunded = 'REFUNDED',
  Voided = 'VOIDED',
}

export enum PaymentEvent {
  AuthorizeSuccess = 'AUTHORIZESUCCESS',
  AuthorizeFailure = 'AUTHORIZEFAILURE',
  CaptureSuccess = 'CAPTURESUCCESS',
  CaptureFailure = 'CAPTUREFAILURE',
  RefundSuccess = 'REFUNDSUCCESS',
  RefundFailure = 'REFUNDFAILURE',
  VoidSuccess = 'VOIDSUCCESS',
  VoidFailure = 'VOIDFAILURE',
}

// discriminated union
export type PaymentState =
  | {
      status: PaymentStatus.Pending;
      targetState: PaymentStatus.Authorized;
    }
  | {
      status: PaymentStatus.Authorized;
      targetState: PaymentStatus.Captured | PaymentStatus.Voided;
    }
  | {
      status: PaymentStatus.Captured;
      targetState: PaymentStatus.Refunded;
    }
  | { status: PaymentStatus.Voided }
  | {
      status: PaymentStatus.Refunded;
    };

export type PaymentTransitions = {
  [PaymentStatus.Pending]:
    | PaymentEvent.AuthorizeSuccess
    | PaymentEvent.AuthorizeFailure;
  [PaymentStatus.Authorized]:
    | PaymentEvent.CaptureSuccess
    | PaymentEvent.CaptureFailure
    | PaymentEvent.VoidSuccess
    | PaymentEvent.VoidFailure;
  [PaymentStatus.Captured]:
    | PaymentEvent.RefundSuccess
    | PaymentEvent.RefundFailure;
  [PaymentStatus.Refunded]: never;
  [PaymentStatus.Voided]: never;
};
