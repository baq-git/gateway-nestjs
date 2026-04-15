import { HttpException, Inject, Injectable, Scope } from '@nestjs/common';
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

      const response = await this.mockBank.authorize(data, idempotencyKey);

      const {
        status,
        currency,
        amount,
        authorizationId,
        createdAt: authorizedAt,
      } = response;

      const stateMachine = createPaymentStateMachine({
        status: PaymentStatus.PENDING,
        targetState: PaymentStatus.AUTHORIZED,
      });

      if (status === 'approved')
        stateMachine.authorize(PaymentEvent.AuthorizeSuccess);
      else {
        stateMachine.authorize(PaymentEvent.AuthorizeFailure);
      }

      const currentState = stateMachine.getState();
      if (currentState instanceof HttpException) {
        throw currentState;
      }

      const paymentEntity = queryRunner.manager.create(PaymentEntity, {
        id: randomUUID(),
        orderId: input.orderId,
        cardNumber: input.cardInfo.cardNumber,
        amount,
        currency,
        state: currentState.status,
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
}
