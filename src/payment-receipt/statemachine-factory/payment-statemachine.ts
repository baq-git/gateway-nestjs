// PHILOSOPHY FOLLOW github.statechart
// "AN ABSTRACT STATE MACHINE IS A SOFTWARE COMPONENT THAT DEFINES A FINITE SET OF STATES":
// One state is defined as the initial state. When a machine starts to execute, it automatically enters this state. [checked]
// Each state can define actions that occur when a machine enters or exits that state.
// Actions will typically have side effects.
// Each state can define events that trigger a transition.
// A transition defines how a machine would react to the event, by exiting one state and entering another state.
// A transition can define actions that occur when the transition happens. Actions will typically have side effects.
// -----------------------------------------------------------------------------
// The event is checked against the current state's transitions.
// If a transition matches the event, that transition “happens”.
// By virtue of a transition “happening”, states are exited, and entered and the relevant actions are performed
// The machine immediately is in the new state, ready to process the next event. [checked]
// -----------------------------------------------------------------------------
// Follow the books: Domain Modeling Made Functional
// A much better approach is to make each state have its own type, which stores
// the data that is relevant to that state (if any). The entire set of states can then
// be represented by a choice type with a case for each state. [checked]

import {
  PaymentStatus,
  PaymentState,
  PaymentTransitions,
  PaymentEvent,
} from './constants';

export interface StateMachine {
  getState: () => PaymentState;
  authorize: (
    event: PaymentTransitions[PaymentStatus.Pending],
  ) => PaymentState | Error;
  capture: (
    event: PaymentTransitions[PaymentStatus.Authorized],
  ) => PaymentState | Error;
  voidy: (
    event: PaymentTransitions[PaymentStatus.Authorized],
  ) => PaymentState | Error;
  refund: (
    event: PaymentTransitions[PaymentStatus.Captured],
  ) => PaymentState | Error;
}
const authorizeTransit = (
  currentState: PaymentState,
  event: PaymentTransitions[PaymentStatus.Pending],
): PaymentState | Error => {
  if (currentState.status !== PaymentStatus.Pending) {
    return new Error('Current state is not Pending');
  }

  switch (event) {
    case PaymentEvent.AuthorizeSuccess:
      return {
        status: PaymentStatus.Authorized,
        targetState: PaymentStatus.Captured,
      };
    case PaymentEvent.AuthorizeFailure:
      return {
        status: PaymentStatus.Pending,
        targetState: PaymentStatus.Authorized,
      };
    default:
      return new Error('Invalid event');
  }
};

const captureTransit = (
  currentState: PaymentState,
  event: PaymentTransitions[PaymentStatus.Authorized],
): PaymentState | Error => {
  if (currentState.status !== PaymentStatus.Authorized) {
    return new Error('Current state is not Authorized');
  }

  switch (event) {
    case PaymentEvent.CaptureSuccess:
      return {
        status: PaymentStatus.Captured,
        targetState: PaymentStatus.Refunded,
      };
    case PaymentEvent.CaptureFailure:
      return {
        status: PaymentStatus.Authorized,
        targetState: PaymentStatus.Captured,
      };
    default:
      return new Error('Invalid event');
  }
};

const voidTransit = (
  currentState: PaymentState,
  event: PaymentTransitions[PaymentStatus.Authorized],
): PaymentState | Error => {
  if (currentState.status !== PaymentStatus.Authorized) {
    return new Error('Current state is not Authorized');
  }

  switch (event) {
    case PaymentEvent.VoidSuccess:
      return {
        status: PaymentStatus.Voided,
      };
    case PaymentEvent.VoidFailure:
      return {
        status: PaymentStatus.Authorized,
        targetState: PaymentStatus.Voided,
      };
    default:
      return new Error('Invalid event');
  }
};

const refundTransit = (
  currentState: PaymentState,
  event: PaymentTransitions[PaymentStatus.Captured],
): PaymentState | Error => {
  if (currentState.status !== PaymentStatus.Captured) {
    return new Error('Current state is not Captured');
  }

  switch (event) {
    case PaymentEvent.RefundSuccess:
      return {
        status: PaymentStatus.Refunded,
      };
    case PaymentEvent.RefundFailure:
      return {
        status: PaymentStatus.Captured,
        targetState: PaymentStatus.Refunded,
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
    transitonFn: (currentState: PaymentState, event: T) => PaymentState | Error,
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
