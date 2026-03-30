import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { lastValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { IdempotencyKeyEntity } from '@domain/entities/idempotency-keys.entity';
import { PaymentEntity, PaymentStatus } from '@domain/entities/payment.entity';
import { AuthorizeService } from '@infrastructure/adapters/bank/mockbank/services/authorize.service';
import { CreateAuthorizePaymentRequestDto } from '@presentation/dtos/authorize-payment.dto';
import { PaymentResponseSuccessDto } from '@presentation/dtos/responses/payments.dto';
import { type Request } from 'express';
import { REQUEST } from '@nestjs/core';
import { QueryRunner } from 'typeorm/browser';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @Inject(REQUEST)
    private request: Request,

    // services
    @Inject(AuthorizeService)
    private readonly authorizeService: AuthorizeService,
  ) {}

  getHeath() {
    return this.authorizeService.getHealth();
  }

  async authorizePayment(
    data: CreateAuthorizePaymentRequestDto & { orderId: string },
    idempotencyKey: string,
  ): Promise<PaymentResponseSuccessDto> {
    try {
      const queryRunner: QueryRunner = this.request['queryRunner'];

      const { amount, cardNumber, cvv, expiryMonth, expiryYear, orderId } =
        data;

      // const authResponse = await lastValueFrom(
      //   this.authorizeService.authorizations(
      //     { amount, cardNumber, cvv, expiryMonth, expiryYear },
      //     idempotencyKey,
      //   ),
      // ).catch((error) => {
      //   throw error;
      // });

      // const payloadPayment = this.paymentRepository.create({
      //   id: uuidv4(),
      //   orderId: orderId,
      //   cardNumber,
      //   amount,
      //   currency: 'USD',
      //   pendingAt: new Date(),
      //   state: PaymentStatus.PENDING,
      // });

      // const savedPayment = await this.paymentRepository.save(payloadPayment);

      // const payment = await queryRunner.manager
      //   .createQueryBuilder(Payment, 'pr')
      //   .setLock('pessimistic_write')
      //   .where('pr.id = :id', { id: savedPayment.id })
      //   .getOneOrFail();

      // await queryRunner.manager.getRepository(IdempotencyKey)
      // .update(idempotencyKey, {
      //   payment: payment,
      // });

      // await queryRunner.manager.save(payment);

      // const result: PaymentResponseSuccessDto = {
      //   statusCode: HttpStatus.CREATED,
      //   message: 'Successful authorization - Return payment',
      //   data: payment,
      // };

      return result;
    } catch (error) {
      throw error;
    }
  }
}
