import { HttpException } from '@nestjs/common';
import { PaymentStatus } from '../constants';

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
      status: PaymentStatus.PENDING;
      targetState: PaymentStatus.AUTHORIZED;
    }
  | {
      status: PaymentStatus.AUTHORIZED;
      targetState: PaymentStatus.CAPTURED | PaymentStatus.VOIDED;
    }
  | {
      status: PaymentStatus.CAPTURED;
      targetState: PaymentStatus.REFUNDED;
    }
  | { status: PaymentStatus.VOIDED }
  | {
      status: PaymentStatus.REFUNDED;
    };

export type PaymentTransitions = {
  [PaymentStatus.PENDING]:
    | PaymentEvent.AuthorizeSuccess
    | PaymentEvent.AuthorizeFailure;
  [PaymentStatus.AUTHORIZED]:
    | PaymentEvent.CaptureSuccess
    | PaymentEvent.CaptureFailure
    | PaymentEvent.VoidSuccess
    | PaymentEvent.VoidFailure;
  [PaymentStatus.CAPTURED]:
    | PaymentEvent.RefundSuccess
    | PaymentEvent.RefundFailure;
  [PaymentStatus.REFUNDED]: never;
  [PaymentStatus.VOIDED]: never;
};

export interface StateMachine {
  getState: () => PaymentState;
  authorize: (
    event: PaymentTransitions[PaymentStatus.PENDING],
  ) => PaymentState | HttpException | Error;
  capture: (
    event: PaymentTransitions[PaymentStatus.AUTHORIZED],
  ) => PaymentState | Error;
  voidy: (
    event: PaymentTransitions[PaymentStatus.AUTHORIZED],
  ) => PaymentState | Error;
  refund: (
    event: PaymentTransitions[PaymentStatus.CAPTURED],
  ) => PaymentState | Error;
}

const authorizeTransit = (
  currentState: PaymentState,
  event: PaymentTransitions[PaymentStatus.PENDING],
): PaymentState | HttpException => {
  if (currentState.status !== PaymentStatus.PENDING) {
    return new HttpException('Current state is not Pending', 402);
  }

  if (event === PaymentEvent.AuthorizeSuccess) {
    return {
      status: PaymentStatus.AUTHORIZED,
      targetState: PaymentStatus.CAPTURED,
    };
  }

  return new HttpException(
    `Invalid state transition: ${PaymentStatus.PENDING} → ${PaymentStatus.AUTHORIZED}`,
    402,
    {
      cause: `Payment Authorize Event is not Success`,
    },
  );
};

const captureTransit = (
  currentState: PaymentState,
  event: PaymentTransitions[PaymentStatus.AUTHORIZED],
): PaymentState | HttpException => {
  if (currentState.status !== PaymentStatus.AUTHORIZED) {
    return new HttpException('Current state is not AUTHORIZED', 402);
  }

  switch (event) {
    case PaymentEvent.CaptureSuccess:
      return {
        status: PaymentStatus.CAPTURED,
        targetState: PaymentStatus.REFUNDED,
      };
    case PaymentEvent.CaptureFailure:
      return {
        status: PaymentStatus.AUTHORIZED,
        targetState: PaymentStatus.CAPTURED,
      };
    default:
      return new HttpException(
        `Invalid state transition: ${PaymentStatus.AUTHORIZED} → ${PaymentStatus.PENDING}`,
        402,
        {
          cause: `Payment Captured Event is not Success or Failure`,
        },
      );
  }
};

const voidTransit = (
  currentState: PaymentState,
  event: PaymentTransitions[PaymentStatus.AUTHORIZED],
): PaymentState | Error => {
  if (currentState.status !== PaymentStatus.AUTHORIZED) {
    return new Error('Current state is not Authorized');
  }

  switch (event) {
    case PaymentEvent.VoidSuccess:
      return {
        status: PaymentStatus.VOIDED,
      };
    case PaymentEvent.VoidFailure:
      return {
        status: PaymentStatus.AUTHORIZED,
        targetState: PaymentStatus.VOIDED,
      };
    default:
      return new HttpException(
        `Invalid state transition: ${PaymentStatus.AUTHORIZED} → ${PaymentStatus.VOIDED}`,
        402,
        {
          cause: `Payment Voided Event is not Success or Failure`,
        },
      );
  }
};

const refundTransit = (
  currentState: PaymentState,
  event: PaymentTransitions[PaymentStatus.CAPTURED],
): PaymentState | Error => {
  if (currentState.status !== PaymentStatus.CAPTURED) {
    return new Error('Current state is not Captured');
  }

  switch (event) {
    case PaymentEvent.RefundSuccess:
      return {
        status: PaymentStatus.REFUNDED,
      };
    case PaymentEvent.RefundFailure:
      return {
        status: PaymentStatus.CAPTURED,
        targetState: PaymentStatus.REFUNDED,
      };
    default:
      return new Error('Invalid event');
  }
};

export const createPaymentStateMachine = (
  initialState: PaymentState,
): StateMachine => {
  let state: PaymentState = initialState;

  const transition = <T extends PaymentEvent>(
    transitonFn: (
      currentState: PaymentState,
      event: T,
    ) => PaymentState | Error | HttpException,
    event: T,
  ) => {
    const currentState = state;
    const nextState = transitonFn(currentState, event);
    if (nextState instanceof Error) {
      state = currentState;
      return nextState;
    }

    state = nextState;
    return nextState;
  };

  return {
    getState: () => state,
    authorize: (event) => transition(authorizeTransit, event),
    capture: (event) => transition(captureTransit, event),
    refund: (event) => transition(refundTransit, event),
    voidy: (event) => transition(voidTransit, event),
  };
};
