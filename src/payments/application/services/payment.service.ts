import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Scope,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { PaymentEntity } from '@domain/entities/payment.entity';
import { type BankPort } from '@infrastructure/adapters/bank/bank.port';
import { REQUEST } from '@nestjs/core';
import { type Request } from 'express';
import { PaymentStatus } from '@domain/constants';
import {
  createPaymentStateMachine,
  PaymentEvent,
} from '@domain/statemachine/payment.statemachine';
import { randomUUID } from 'crypto';
import { CreateAuthorizationMockBankRequestDto } from '@infrastructure/adapters/bank/mockbank/dtos/requests/authorize-mockbank.request.dto';
import { CheckoutRequestDto } from '../dtos/request/payment.request.dto';
import { MockBankAdapter } from '@infrastructure/adapters/bank/mockbank/mockbank.adapter';
import { CreateCaptureMockBankRequestDto } from '@payments/infrastructure/adapters/bank/mockbank/dtos/requests/capture-mockbank.request.dto';
import { CreateVoidMockBankRequestDto } from '@payments/infrastructure/adapters/bank/mockbank/dtos/requests/void-mockbank.request.dto';
import { CreateRefundMockBankRequestDto } from '@payments/infrastructure/adapters/bank/mockbank/dtos/requests/refund-mockbank.request.dto';

@Injectable({ scope: Scope.REQUEST })
export class PaymentService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @Inject(MockBankAdapter)
    private readonly mockBank: BankPort,
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  async authorize(input: CheckoutRequestDto, queryRunner: QueryRunner) {
    const idempotencyKey = this.request.get('idempotency-key') as string;
    const stateMachine = createPaymentStateMachine(PaymentStatus.PENDING);

    const data: CreateAuthorizationMockBankRequestDto = {
      amount: input.amount,
      cardNumber: input.cardInfo.cardNumber,
      cvv: input.cardInfo.cvv,
      expiryMonth: input.cardInfo.expiryMonth,
      expiryYear: input.cardInfo.expiryYear,
    };

    const paymentEntity = queryRunner.manager.create(PaymentEntity, {
      id: randomUUID(),
      customerId: input.customerId,
      orderId: input.orderId,
      cardNumber: input.cardInfo.cardNumber,
      createdAt: Date.now(),
      state: PaymentStatus.PENDING,
      idempotencyKeys: [idempotencyKey],
    });

    try {
      const {
        status,
        currency,
        amount,
        authorizationId,
        createdAt: authorizedAt,
      } = await this.mockBank.authorize(data, idempotencyKey);

      const event =
        status === PaymentStatus.AUTHORIZED
          ? PaymentEvent.AUTHORIZE_SUCCESS
          : PaymentEvent.AUTHORIZE_FAILURE;

      stateMachine.authorize(event);

      paymentEntity.state = stateMachine.getState();
      paymentEntity.authorizationId = authorizationId;
      paymentEntity.authorizedAt = new Date(authorizedAt);
      paymentEntity.amount = amount;
      paymentEntity.currency = currency;

      if (stateMachine.getState() !== PaymentStatus.AUTHORIZED) {
        throw new HttpException(
          `Authorization Failed: Cannot perform action ${stateMachine.authorize.name} on payment in ${stateMachine.getState()}' state `,
          HttpStatus.UNPROCESSABLE_ENTITY,
          {
            cause: {
              authorizationId: paymentEntity.authorizationId,
              currentState: stateMachine.getState(),
              action: stateMachine.authorize.name,
            },
          },
        );
      }
    } catch (error) {
      throw error;
    }

    const result = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into(PaymentEntity)
      .values([paymentEntity])
      .returning('*')
      .execute();

    return result.generatedMaps[0];
  }

  async capture(paymentReference: string, queryRunner: QueryRunner) {
    const idempotencyKey = this.request.get('idempotency-key') as string;

    const lockedPayment = await queryRunner.manager
      .getRepository(PaymentEntity)
      .createQueryBuilder('payment')
      .where('payment.id = :id', { id: paymentReference })
      .setLock('pessimistic_write')
      .getOne();

    if (!lockedPayment) {
      throw new HttpException('PAYMENT NOT FOUND', HttpStatus.NOT_FOUND);
    }

    const { state, amount, authorizationId } = lockedPayment;

    const stateMachine = createPaymentStateMachine(state);

    try {
      const data: CreateCaptureMockBankRequestDto = {
        amount,
        authorizationId,
      };

      const { status, captureId, capturedAt } = await this.mockBank.capture(
        data,
        idempotencyKey,
      );

      const event =
        status === PaymentStatus.CAPTURED
          ? PaymentEvent.CAPTURE_SUCCESS
          : PaymentEvent.CAPTURE_FAILURE;

      stateMachine.capture(event);

      if (stateMachine.getState() === PaymentStatus.CAPTURED) {
        lockedPayment.captureId = captureId;
        lockedPayment.capturedAt = new Date(capturedAt);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        const code = error.getStatus();
        // error code from bank
        if (code >= 400 && code < 500) {
          stateMachine.capture(PaymentEvent.CAPTURE_FAILURE);
        } else {
          throw error;
        }
      }
    } finally {
      lockedPayment.state = stateMachine.getState();
      lockedPayment.updatedAt = new Date();

      await queryRunner.manager.save(lockedPayment);
    }
  }

  async void(paymentReference: string, queryRunner: QueryRunner) {
    const idempotencyKey = this.request.get('idempotency-key') as string;

    const lockedPayment = await queryRunner.manager
      .getRepository(PaymentEntity)
      .createQueryBuilder('payment')
      .where('payment.id = :id', { id: paymentReference })
      .setLock('pessimistic_write')
      .getOne();

    if (!lockedPayment) {
      throw new HttpException('PAYMENT NOT FOUND', HttpStatus.NOT_FOUND);
    }

    const { state, authorizationId } = lockedPayment;

    const stateMachine = createPaymentStateMachine(state);

    try {
      const data: CreateVoidMockBankRequestDto = {
        authorizationId,
      };

      const { status, voidId, voidedAt } = await this.mockBank.void(
        data,
        idempotencyKey,
      );

      const event =
        status === PaymentStatus.VOIDED
          ? PaymentEvent.VOID_SUCCESS
          : PaymentEvent.VOID_FAILURE;

      stateMachine.void(event);

      if (stateMachine.getState() === PaymentStatus.VOIDED) {
        lockedPayment.voidId = voidId;
        lockedPayment.voidedAt = new Date(voidedAt);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        const code = error.getStatus();
        // error code from bank
        if (code >= 400 && code < 500) {
          stateMachine.void(PaymentEvent.VOID_FAILURE);
        } else {
          throw error;
        }
      }
    } finally {
      lockedPayment.state = stateMachine.getState();
      lockedPayment.updatedAt = new Date();

      await queryRunner.manager.save(lockedPayment);
    }
  }

  async refund(paymentReference: string, queryRunner: QueryRunner) {
    const idempotencyKey = this.request.get('idempotency-key') as string;

    const lockedPayment = await queryRunner.manager
      .getRepository(PaymentEntity)
      .createQueryBuilder('payment')
      .where('payment.id = :id', { id: paymentReference })
      .setLock('pessimistic_write')
      .getOne();

    if (!lockedPayment) {
      throw new HttpException('PAYMENT NOT FOUND', HttpStatus.NOT_FOUND);
    }

    const { state, captureId, amount } = lockedPayment;

    const stateMachine = createPaymentStateMachine(state);

    try {
      const data: CreateRefundMockBankRequestDto = {
        captureId,
        amount,
      };

      const { status, refundId, refundedAt } = await this.mockBank.refund(
        data,
        idempotencyKey,
      );

      const event =
        status === PaymentStatus.REFUNDED
          ? PaymentEvent.REFUND_SUCCESS
          : PaymentEvent.REFUND_FAILURE;

      stateMachine.refund(event);

      if (stateMachine.getState() === PaymentStatus.REFUNDED) {
        lockedPayment.refundId = refundId;
        lockedPayment.refundedAt = new Date(refundedAt);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        const code = error.getStatus();
        // error code from bank
        if (code >= 400 && code < 500) {
          stateMachine.refund(PaymentEvent.REFUND_FAILURE);
        } else {
          throw error;
        }
      }
    } finally {
      lockedPayment.state = stateMachine.getState();
      lockedPayment.updatedAt = new Date();

      await queryRunner.manager.save(lockedPayment);
    }
  }
}
