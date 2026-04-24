import { HttpException, HttpStatus } from '@nestjs/common';
import { PaymentStatus } from '../constants';

export enum PaymentEvent {
  AUTHORIZE_SUCCESS = 'AUTHORIZE_SUCCESS',
  AUTHORIZE_FAILURE = 'AUTHORIZE_FAILURE',
  CAPTURE_SUCCESS = 'CAPTURE_SUCCESS',
  CAPTURE_FAILURE = 'CAPTURE_FAILURE',
  VOID_SUCCESS = 'VOID_SUCCESS',
  VOID_FAILURE = 'VOID_FAILURE',
  REFUND_SUCCESS = 'REFUND_SUCCESS',
  REFUND_FAILURE = 'REFUND_FAILURE',
}

const AllowedTransition: Record<PaymentStatus, PaymentEvent[]> = {
  [PaymentStatus.PENDING]: [
    PaymentEvent.AUTHORIZE_SUCCESS,
    PaymentEvent.AUTHORIZE_FAILURE,
  ],
  [PaymentStatus.AUTHORIZED]: [
    PaymentEvent.CAPTURE_SUCCESS,
    PaymentEvent.CAPTURE_FAILURE,
    PaymentEvent.VOID_SUCCESS,
    PaymentEvent.VOID_FAILURE,
  ],
  [PaymentStatus.CAPTURED]: [
    PaymentEvent.REFUND_SUCCESS,
    PaymentEvent.REFUND_FAILURE,
  ],
  [PaymentStatus.VOIDED]: [],
  [PaymentStatus.REFUNDED]: [],
};

export interface PaymentStateMachine {
  getState: () => PaymentStatus;
  authorize: (event: PaymentEvent) => void;
  capture: (event: PaymentEvent) => void;
  void: (event: PaymentEvent) => void;
  refund: (event: PaymentEvent) => void;
}

export const createPaymentStateMachine = (
  initialState: PaymentStatus,
): PaymentStateMachine => {
  let currentState = initialState;

  const transition = (event: PaymentEvent, newState: PaymentStatus): void => {
    if (!AllowedTransition[currentState].includes(event)) {
      throw new HttpException(
        `Invalid transition: ${currentState} --${event}--> ${newState}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    currentState = newState;
  };

  return {
    getState: () => currentState,
    authorize: (event) =>
      transition(
        event,
        event === PaymentEvent.AUTHORIZE_SUCCESS
          ? PaymentStatus.AUTHORIZED
          : PaymentStatus.PENDING,
      ),
    capture: (event) =>
      transition(
        event,
        event === PaymentEvent.CAPTURE_SUCCESS
          ? PaymentStatus.CAPTURED
          : PaymentStatus.AUTHORIZED,
      ),

    void: (event) =>
      transition(
        event,
        event === PaymentEvent.VOID_SUCCESS
          ? PaymentStatus.VOIDED
          : PaymentStatus.AUTHORIZED,
      ),
    refund: (event) =>
      transition(
        event,
        event === PaymentEvent.REFUND_SUCCESS
          ? PaymentStatus.REFUNDED
          : PaymentStatus.CAPTURED,
      ),
  };
};
