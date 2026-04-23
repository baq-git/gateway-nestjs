import {
  createPaymentStateMachine,
  PaymentEvent,
} from '../payment.statemachine';
import { PaymentStatus } from '../../constants';
import { HttpException } from '@nestjs/common';

describe('Payment State Machine', () => {
  describe('From PENDING', () => {
    it('should transition to AUTHORIZED on AUTHORIZE_SUCCESS', () => {
      const sm = createPaymentStateMachine(PaymentStatus.PENDING);

      sm.authorize(PaymentEvent.AUTHORIZE_SUCCESS);

      expect(sm.getState()).toBe(PaymentStatus.AUTHORIZED);
    });

    it('should stay in PENDING on AUTHORIZE_FAILURE', () => {
      const sm = createPaymentStateMachine(PaymentStatus.PENDING);

      sm.authorize(PaymentEvent.AUTHORIZE_FAILURE);

      expect(sm.getState()).toBe(PaymentStatus.PENDING);
    });

    it('should throw error on invalid transition (e.g. CAPTURE_SUCCESS)', () => {
      const sm = createPaymentStateMachine(PaymentStatus.PENDING);

      expect(() => sm.capture(PaymentEvent.CAPTURE_SUCCESS)).toThrow(
        'Invalid transition',
      );
    });
  });

  describe('From AUTHORIZED', () => {
    let sm: ReturnType<typeof createPaymentStateMachine>;

    beforeEach(() => {
      sm = createPaymentStateMachine(PaymentStatus.AUTHORIZED);
    });

    it('should transition to CAPTURED on CAPTURE_SUCCESS', () => {
      sm.capture(PaymentEvent.CAPTURE_SUCCESS);
      expect(sm.getState()).toBe(PaymentStatus.CAPTURED);
    });

    it('should stay in AUTHORIZED on CAPTURE_FAILURE', () => {
      sm.capture(PaymentEvent.CAPTURE_FAILURE);
      expect(sm.getState()).toBe(PaymentStatus.AUTHORIZED);
    });

    it('should transition to VOIDED on VOID_SUCCESS', () => {
      sm.void(PaymentEvent.VOID_SUCCESS);
      expect(sm.getState()).toBe(PaymentStatus.VOIDED);
    });

    it('should throw error when trying to refund from AUTHORIZED', () => {
      expect(() => sm.refund(PaymentEvent.REFUND_SUCCESS)).toThrow(
        'Invalid transition',
      );
    });
  });

  describe('From CAPTURED', () => {
    let sm: ReturnType<typeof createPaymentStateMachine>;

    beforeEach(() => {
      sm = createPaymentStateMachine(PaymentStatus.CAPTURED);
    });

    it('should transition to REFUNDED on REFUND_SUCCESS', () => {
      sm.refund(PaymentEvent.REFUND_SUCCESS);
      expect(sm.getState()).toBe(PaymentStatus.REFUNDED);
    });

    it('should stay in CAPTURED on REFUND_FAILURE', () => {
      sm.refund(PaymentEvent.REFUND_FAILURE);
      expect(sm.getState()).toBe(PaymentStatus.CAPTURED);
    });

    it('should throw error when trying to capture again', () => {
      expect(() => sm.capture(PaymentEvent.CAPTURE_SUCCESS)).toThrow(
        'Invalid transition',
      );
    });
  });

  describe('Terminal States', () => {
    it('should not allow any transition from VOIDED', () => {
      const sm = createPaymentStateMachine(PaymentStatus.VOIDED);

      expect(() => sm.authorize(PaymentEvent.AUTHORIZE_SUCCESS)).toThrow();
      expect(() => sm.capture(PaymentEvent.CAPTURE_SUCCESS)).toThrow();
      expect(() => sm.void(PaymentEvent.VOID_SUCCESS)).toThrow();
      expect(() => sm.refund(PaymentEvent.REFUND_SUCCESS)).toThrow();
    });

    it('should not allow any transition from REFUNDED', () => {
      const sm = createPaymentStateMachine(PaymentStatus.REFUNDED);

      expect(() => sm.capture(PaymentEvent.CAPTURE_SUCCESS)).toThrow();
      expect(() => sm.refund(PaymentEvent.REFUND_SUCCESS)).toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should throw clear error message on invalid transition', () => {
      const sm = createPaymentStateMachine(PaymentStatus.PENDING);

      expect(() => sm.capture(PaymentEvent.CAPTURE_SUCCESS)).toThrow(
        'Invalid transition: pending --CAPTURE_SUCCESS--> captured',
      );
    });

    it('should throw HttpException)', () => {
      const sm = createPaymentStateMachine(PaymentStatus.PENDING);

      expect(() => sm.capture(PaymentEvent.CAPTURE_SUCCESS)).toThrow(
        HttpException,
      );
    });
  });
});
