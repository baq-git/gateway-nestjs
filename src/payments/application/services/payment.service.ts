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
    try {
      const idempotencyKey = this.request.get('idempotency-key') as string;

      const data: CreateAuthorizationMockBankRequestDto = {
        amount: input.amount,
        cardNumber: input.cardInfo.cardNumber,
        cvv: input.cardInfo.cvv,
        expiryMonth: input.cardInfo.expiryMonth,
        expiryYear: input.cardInfo.expiryYear,
      };

      const stateMachine = createPaymentStateMachine(PaymentStatus.PENDING);

      const {
        status,
        currency,
        amount,
        authorizationId,
        createdAt: authorizedAt,
      } = await this.mockBank.authorize(data, idempotencyKey);

      if (status === PaymentStatus.AUTHORIZED)
        stateMachine.authorize(PaymentEvent.AUTHORIZE_SUCCESS);
      else {
        stateMachine.authorize(PaymentEvent.AUTHORIZE_FAILURE);
      }

      const currentState = stateMachine.getState();

      if (currentState !== PaymentStatus.AUTHORIZED) {
        throw new HttpException(
          `Invalid State Transition: Cannot perform action ${stateMachine.authorize.name} on payment in ${currentState}' state`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          {
            cause: {
              authorizationId,
              currentState,
              action: stateMachine.authorize.name,
            },
          },
        );
      }

      const paymentEntity = queryRunner.manager.create(PaymentEntity, {
        id: randomUUID(),
        orderId: input.orderId,
        cardNumber: input.cardInfo.cardNumber,
        amount,
        currency,
        state: currentState,
        authorizationId,
        authorizedAt,
        createdAt: Date.now(),
        idempotencyKeys: [idempotencyKey],
      });

      const result = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(PaymentEntity)
        .values([paymentEntity])
        .returning('*')
        .execute();

      return result.generatedMaps[0];
    } catch (error) {
      throw error;
    }
  }

  // async capture(paymentReference: string, queryRunner: QueryRunner) {
  //   try {
  //     const idempotencyKey = this.request.get('idempotency-key') as string;
  //
  //     const lockedPayment = await queryRunner.manager
  //       .getTreeRepository(PaymentEntity)
  //       .createQueryBuilder('payment')
  //       .where('payment.id = :id', { id: paymentReference })
  //       .setLock('pessimistic_write')
  //       .getOne();
  //
  //     if (!lockedPayment) {
  //       throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
  //     }
  //
  //     const { state, amount, authorizationId } = lockedPayment;
  //
  //     const stateMachine = createPaymentStateMachine(state);
  //
  //     const data: CreateCaptureMockBankRequestDto = {
  //       amount,
  //       authorizationId,
  //     };
  //
  //     const { status, captureId, capturedAt } = await this.mockBank.capture(
  //       data,
  //       idempotencyKey,
  //     );
  //
  //     const currentState = stateMachine.getState();
  //
  //     if (
  //       currentState instanceof HttpException ||
  //       currentState instanceof Error
  //     ) {
  //       throw currentState;
  //     }
  //
  //     lockedPayment.state = currentState.status;
  //     lockedPayment.captureId = captureId;
  //     lockedPayment.capturedAt = new Date(capturedAt);
  //     lockedPayment.updatedAt = new Date();
  //
  //     await queryRunner.manager.save(lockedPayment);
  //   } catch (error) {
  //     throw error;
  // }
  // }
}
