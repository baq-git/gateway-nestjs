import { PaymentStatus } from '@domain/constants';
import {
  createPaymentStateMachine,
  PaymentEvent,
  PaymentState,
} from '../payment.statemachine';
import { HttpException } from '@nestjs/common';

describe('Payment statemachine', () => {
  let initialState: PaymentState;

  beforeEach(() => {
    initialState = {
      status: PaymentStatus.PENDING,
      targetState: PaymentStatus.AUTHORIZED,
    };
  });

  describe('Init stage', () => {
    it('initstate should be Pending', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      const state = paymentStateMachine.getState();

      expect(state.status).toBe(PaymentStatus.PENDING);
    });
  });

  describe('From Pending to Authorized', () => {
    it('should transit from Pending to Authorized with AuthorizeSuccess event', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      const expectedState = {
        status: PaymentStatus.AUTHORIZED,
        targetState: PaymentStatus.CAPTURED,
      };

      paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      const state = paymentStateMachine.getState();
      expect(state).toEqual(expectedState);
    });

    it('should return error if current state is not Pending', () => {
      const initialState: PaymentState = {
        status: PaymentStatus.AUTHORIZED,
        targetState: PaymentStatus.CAPTURED,
      };

      const paymentStateMachine = createPaymentStateMachine(initialState);

      expect(
        paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess),
      ).toBeInstanceOf(HttpException);
    });
  });

  describe('From Authorized to Captured', () => {
    it.each([
      {
        currentState: {
          status: PaymentStatus.PENDING,
          targetState: PaymentStatus.AUTHORIZED,
        } as PaymentState,
        expected: {
          state: {
            status: PaymentStatus.PENDING,
            targetState: PaymentStatus.AUTHORIZED,
          },
        },
        event: PaymentEvent.CaptureSuccess as PaymentEvent.CaptureSuccess,
        message: 'Current state is not Authorized',
        metadata: 'Captured could not capture twice',
      },
      {
        currentState: {
          status: PaymentStatus.CAPTURED,
          targetState: PaymentStatus.REFUNDED,
        } as PaymentState,
        expected: {
          state: {
            status: PaymentStatus.CAPTURED,
            targetState: PaymentStatus.REFUNDED,
          },
        },
        event: PaymentEvent.CaptureSuccess as PaymentEvent.CaptureSuccess,
        message: 'Current state is not Authorized',
        metadata: 'Captured could not capture twice',
      },
      {
        currentState: {
          status: PaymentStatus.REFUNDED,
        } as PaymentState,
        expected: {
          state: {
            status: PaymentStatus.REFUNDED,
          },
        },
        event: PaymentEvent.CaptureSuccess as PaymentEvent.CaptureSuccess,
        message: 'Current state is not Authorized',
        metadata: 'Refunded could not capture back',
      },
      {
        currentState: {
          status: PaymentStatus.VOIDED,
        } as PaymentState,
        expected: {
          state: {
            status: PaymentStatus.VOIDED,
          },
        },
        event: PaymentEvent.CaptureSuccess as PaymentEvent.CaptureSuccess,
        message: 'Current state is not Authorized',
        metadata: 'Voided could not capture back',
      },
    ])(
      'should return error if current state is not Authorized: $metadata',
      ({ currentState: testState, expected, event, message }) => {
        const paymentStateMachine = createPaymentStateMachine(testState);
        const result = paymentStateMachine.capture(event);
        expect(result).toBeInstanceOf(Error);
        expect(result).toEqual(new Error(message));
        expect(paymentStateMachine.getState()).toEqual(expected.state);
      },
    );

    it('should be Captured if Authorized and Captured success', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      paymentStateMachine.capture(PaymentEvent.CaptureSuccess);
      const state = paymentStateMachine.getState();
      expect(state.status).toBe(PaymentStatus.CAPTURED);
    });

    it('should be back to Authroized if Captured failure', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      paymentStateMachine.capture(PaymentEvent.CaptureFailure);
      const state = paymentStateMachine.getState();
      expect(state.status).toBe(PaymentStatus.AUTHORIZED);
    });
  });

  describe('From Authorized to Voided', () => {
    it('should return error if current state is not Authorized', () => {
      const initialState: PaymentState = {
        status: PaymentStatus.CAPTURED,
        targetState: PaymentStatus.REFUNDED,
      };

      const paymentStateMachine = createPaymentStateMachine(initialState);

      expect(
        paymentStateMachine.voidy(PaymentEvent.VoidSuccess),
      ).toBeInstanceOf(Error);
      expect(paymentStateMachine.getState()).toEqual(initialState);
      expect(
        paymentStateMachine.voidy(PaymentEvent.VoidSuccess) as Error,
      ).toEqual(new Error('Current state is not Authorized'));
    });

    it('should be Voided if Authorized and Voided success', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      paymentStateMachine.voidy(PaymentEvent.VoidSuccess);
      const state = paymentStateMachine.getState();
      expect(state.status).toBe(PaymentStatus.VOIDED);
    });

    it('should be back to Authorized if Voided failure', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      paymentStateMachine.voidy(PaymentEvent.VoidFailure);
      const state = paymentStateMachine.getState();
      expect(state.status).toBe(PaymentStatus.AUTHORIZED);
    });
  });

  describe('From Captured to Refunded', () => {
    it('should return error if current state is not Captured', () => {
      const initialState: PaymentState = {
        status: PaymentStatus.AUTHORIZED,
        targetState: PaymentStatus.CAPTURED,
      };

      const paymentStateMachine = createPaymentStateMachine(initialState);

      expect(
        paymentStateMachine.refund(PaymentEvent.RefundSuccess),
      ).toBeInstanceOf(Error);
      expect(paymentStateMachine.getState()).toEqual(initialState);
      expect(
        paymentStateMachine.refund(PaymentEvent.RefundSuccess) as Error,
      ).toEqual(new Error('Current state is not Captured'));
    });

    it('should be Refunded if Refund success', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      paymentStateMachine.capture(PaymentEvent.CaptureSuccess);
      paymentStateMachine.refund(PaymentEvent.RefundSuccess);
      const state = paymentStateMachine.getState();
      expect(state.status).toBe(PaymentStatus.REFUNDED);
    });
  });
});
