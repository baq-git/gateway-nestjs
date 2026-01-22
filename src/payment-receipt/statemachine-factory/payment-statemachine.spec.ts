// I try TDD for this implementation
// UNIT TESTS: fail first

import { PaymentState, PaymentStatus, PaymentEvent } from './constants';
import { createPaymentStateMachine } from './payment-statemachine';

describe('Payment statemachine', () => {
  let initialState: PaymentState;

  beforeEach(() => {
    initialState = {
      status: PaymentStatus.Pending,
      targetState: PaymentStatus.Authorized,
    };
  });

  describe('Init stage', () => {
    it('initstate should be Pending', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      const state = paymentStateMachine.getState();

      expect(state.status).toBe(PaymentStatus.Pending);
    });
  });

  describe('From Pending to Authorized', () => {
    it('should transit back Pending with AuthorizedFailure event', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      paymentStateMachine.authorize(PaymentEvent.AuthorizeFailure);
      const state = paymentStateMachine.getState();
      expect(state.status).toBe(PaymentStatus.Pending);
    });

    it('should transit from Pending to Authorized with AuthorizeSuccess event', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      const expectedState = {
        status: PaymentStatus.Authorized,
        targetState: PaymentStatus.Captured,
      };

      paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      const state = paymentStateMachine.getState();
      expect(state).toEqual(expectedState);
    });

    it('should return error if current state is not Pending', () => {
      const initialState: PaymentState = {
        status: PaymentStatus.Authorized,
        targetState: PaymentStatus.Captured,
      };

      const paymentStateMachine = createPaymentStateMachine(initialState);

      expect(
        paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess),
      ).toBeInstanceOf(Error);
      expect(paymentStateMachine.getState()).toEqual(initialState);
      expect(
        paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess) as Error,
      ).toEqual(new Error('Current state is not Pending'));
    });
  });

  describe('From Authorized to Captured', () => {
    it.each([
      {
        currentState: {
          status: PaymentStatus.Pending,
          targetState: PaymentStatus.Authorized,
        } as PaymentState,
        expected: {
          state: {
            status: PaymentStatus.Pending,
            targetState: PaymentStatus.Authorized,
          },
        },
        event: PaymentEvent.CaptureSuccess as PaymentEvent.CaptureSuccess,
        message: 'Current state is not Authorized',
        metadata: 'Captured could not capture twice',
      },
      {
        currentState: {
          status: PaymentStatus.Captured,
          targetState: PaymentStatus.Refunded,
        } as PaymentState,
        expected: {
          state: {
            status: PaymentStatus.Captured,
            targetState: PaymentStatus.Refunded,
          },
        },
        event: PaymentEvent.CaptureSuccess as PaymentEvent.CaptureSuccess,
        message: 'Current state is not Authorized',
        metadata: 'Captured could not capture twice',
      },
      {
        currentState: {
          status: PaymentStatus.Refunded,
        } as PaymentState,
        expected: {
          state: {
            status: PaymentStatus.Refunded,
          },
        },
        event: PaymentEvent.CaptureSuccess as PaymentEvent.CaptureSuccess,
        message: 'Current state is not Authorized',
        metadata: 'Refunded could not capture back',
      },
      {
        currentState: {
          status: PaymentStatus.Voided,
        } as PaymentState,
        expected: {
          state: {
            status: PaymentStatus.Voided,
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
      expect(state.status).toBe(PaymentStatus.Captured);
    });

    it('should be back to Authroized if Captured failure', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      paymentStateMachine.capture(PaymentEvent.CaptureFailure);
      const state = paymentStateMachine.getState();
      expect(state.status).toBe(PaymentStatus.Authorized);
    });
  });

  describe('From Authorized to Voided', () => {
    it('should return error if current state is not Authorized', () => {
      const initialState: PaymentState = {
        status: PaymentStatus.Captured,
        targetState: PaymentStatus.Refunded,
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
      expect(state.status).toBe(PaymentStatus.Voided);
    });

    it('should be back to Authorized if Voided failure', () => {
      const paymentStateMachine = createPaymentStateMachine(initialState);
      paymentStateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      paymentStateMachine.voidy(PaymentEvent.VoidFailure);
      const state = paymentStateMachine.getState();
      expect(state.status).toBe(PaymentStatus.Authorized);
    });
  });

  describe('From Captured to Refunded', () => {
    it('should return error if current state is not Captured', () => {
      const initialState: PaymentState = {
        status: PaymentStatus.Authorized,
        targetState: PaymentStatus.Captured,
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
      expect(state.status).toBe(PaymentStatus.Refunded);
    });
  });
});
