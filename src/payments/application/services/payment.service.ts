import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { lastValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { QueryRunner } from 'typeorm/browser';
import { IdempotencyKey } from '@domain/entities/idempotency-keys.entity';
import {
  PaymentReceipt,
  PaymentReceiptStatus,
} from '@domain/entities/payment.entity';
import { AuthorizeService } from '@infrastructure/adapters/bank/mockbank/services/authorize.service';
import { CreateAuthorizePaymentRequestDto } from '@presentation/dtos/authorize-payment.dto';
import { PaymentReceiptResponseSuccessDto } from '@presentation/dtos/responses/payments.dto';

@Injectable()
export class PaymentReceiptService {
  constructor(
    @InjectRepository(PaymentReceipt)
    private readonly paymentReceiptRepository: Repository<PaymentReceipt>,
    @Inject(AuthorizeService)
    private readonly authorizeService: AuthorizeService,

    // private dataSource: DataSource,
  ) {}

  getHeath() {
    return this.authorizeService.getHealth();
  }

  async authorizePaymentReceipt(
    queryRunner: QueryRunner,
    data: CreateAuthorizePaymentRequestDto & { orderId: string },
    idempotencyKey: string,
  ): Promise<PaymentReceiptResponseSuccessDto> {
    try {
      const { amount, cardNumber, cvv, expiryMonth, expiryYear, orderId } =
        data;

      const authResponse = await lastValueFrom(
        this.authorizeService.authorizations(
          { amount, cardNumber, cvv, expiryMonth, expiryYear },
          idempotencyKey,
        ),
      ).catch((error) => {
        throw error;
      });

      const payloadPaymentReceipt = this.paymentReceiptRepository.create({
        id: uuidv4(),
        orderId: orderId,
        cardNumber,
        amount,
        currency: 'USD',
        pendingAt: new Date(),
        state: PaymentReceiptStatus.PENDING,
      });

      const savedPaymentReceipt = await this.paymentReceiptRepository.save(
        payloadPaymentReceipt,
      );

      const paymentReceipt = await queryRunner.manager
        .createQueryBuilder(PaymentReceipt, 'pr')
        .setLock('pessimistic_write')
        .where('pr.id = :id', { id: savedPaymentReceipt.id })
        .getOneOrFail();

      if (paymentReceipt.state !== PaymentReceiptStatus.PENDING) {
        throw new HttpException(
          'Rejected: Payment Receipt is not in pending state',
          HttpStatus.BAD_REQUEST,
          {
            cause: {
              statusCode: HttpStatus.BAD_REQUEST,
              statusText: 'Rejected: Payment Receipt is not in pending state',
              data: {
                payload: paymentReceipt,
              },
            },
          },
        );
      }

      paymentReceipt.authorizationId = authResponse.data.authorizationId;
      paymentReceipt.authorizedAt = new Date();
      paymentReceipt.state = PaymentReceiptStatus.AUTHORIZED;

      await queryRunner.manager
        .getRepository(IdempotencyKey)
        .update(idempotencyKey, {
          paymentReceipt: paymentReceipt,
        });

      await queryRunner.manager.save(paymentReceipt);

      const result: PaymentReceiptResponseSuccessDto = {
        statusCode: HttpStatus.CREATED,
        message: 'Successful authorization - Return payment receipt',
        data: paymentReceipt,
      };

      return result;
    } catch (error) {
      throw error;
    }
  }
}
