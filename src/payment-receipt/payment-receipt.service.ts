import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  PaymentReceipt,
  PaymentReceiptStatus,
} from './entity/payment-receipt.entity';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { AuthorizeService } from '../mockbank/authorize/authorize.service';
import { CaptureService } from '../mockbank/capture/capture.service';
import { v4 as uuidv4 } from 'uuid';
import { lastValueFrom } from 'rxjs';
import { RefundService } from 'src/mockbank/refund/refund.service';
import { VoidService } from 'src/mockbank/void/void.service';
import { IdempotencyKey } from './entity/idempotency-keys.entity';
import { CreateAuthorizePaymentRequestDto } from 'src/dtos/mockbank/authorize-payment.dto';
import { PaymentReceiptResponseSuccessDto } from 'src/dtos/payment-receipt/payment-receipt.dto';

@Injectable()
export class PaymentReceiptService {
  constructor(
    @InjectRepository(PaymentReceipt)
    private readonly paymentReceiptRepository: Repository<PaymentReceipt>,
    @Inject(AuthorizeService)
    private readonly authorizeService: AuthorizeService,
    @Inject(CaptureService)
    private readonly captureService: CaptureService,
    @Inject(RefundService)
    private readonly refundService: RefundService,
    @Inject(VoidService)
    private readonly voidService: VoidService,

    private dataSource: DataSource,
  ) {}

  getHeath() {
    return this.authorizeService.getHealth();
  }

  async authorizePaymentReceipt(
    data: CreateAuthorizePaymentRequestDto & { orderId: string },
    idempotencyKey: string,
    queryRunner: QueryRunner,
  ): Promise<PaymentReceiptResponseSuccessDto> {
    const { amount, cardNumber, cvv, expiryMonth, expiryYear, orderId } = data;

    const payloadPaymentReceipt = this.paymentReceiptRepository.create({
      id: uuidv4(),
      orderId: orderId,
      cardNumber,
      amount,
      currency: 'USD',
      pendingAt: new Date(),
      state: PaymentReceiptStatus.PENDING,
    });

    try {
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
              data: paymentReceipt,
            },
          },
        );
      }

      const authResponse = await lastValueFrom(
        this.authorizeService.authorizations(
          { amount, cardNumber, cvv, expiryMonth, expiryYear },
          idempotencyKey,
        ),
      );

      paymentReceipt.authorizationId = authResponse.data.authorizationId;
      paymentReceipt.authorizedAt = new Date();
      paymentReceipt.state = PaymentReceiptStatus.AUTHORIZED;

      await queryRunner.manager
        .getRepository(IdempotencyKey)
        .update(idempotencyKey, {
          paymentReceipt: paymentReceipt,
        });

      await queryRunner.manager.save(paymentReceipt);

      return {
        statusCode: HttpStatus.CREATED,
        message: 'Successful authorization',
        data: {
          paymentReferenceId: paymentReceipt.id,
          paymentState: paymentReceipt.state,
          currency: paymentReceipt.currency,
          amount: paymentReceipt.amount,
          pendingAt: paymentReceipt.pendingAt,
          authorizedAt: paymentReceipt.authorizedAt,
          capturedAt: paymentReceipt.capturedAt,
          refundedAt: paymentReceipt.refundedAt,
          createAt: paymentReceipt.createdAt,
          voidedAt: paymentReceipt.voidedAt,
        },
      };
    } catch (error) {
      // if (error instanceof HttpException) {
      //   throw new HttpException(
      //     error.message || 'Internal server error',
      //     error.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR,
      //     {
      //       cause: {
      //         statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      //         statusText:
      //           'Payment Receipt could not be created or saved with payload',
      //         data: payloadPaymentReceipt,
      //       },
      //     },
      //   );
      // }

      throw error;
    }
  }

  async capturePaymentReceipt(
    paymentReceiptId: string,
    idempotencyKey: string,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // retrieve payment receipt from gateway db FOR UPDATE
      const paymentReceipt = await queryRunner.manager
        .createQueryBuilder(PaymentReceipt, 'pr')
        .setLock('pessimistic_write')
        .where('pr.id = :id', { id: paymentReceiptId })
        .getOneOrFail();

      if (!paymentReceipt) {
        throw new HttpException(
          'Rejected: Payment Receipt not found',
          HttpStatus.BAD_REQUEST,
          {
            cause: 'Payment Receipt not found',
          },
        );
      }

      if (paymentReceipt.state !== PaymentReceiptStatus.AUTHORIZED) {
        throw new HttpException(
          'Rejected: Payment Receipt is not in authorized state',
          HttpStatus.BAD_REQUEST,
          {
            cause: 'Payment Receipt is not in authorized state',
          },
        );
      }

      const captureResponse = await lastValueFrom(
        this.captureService.captures(
          {
            amount: paymentReceipt.amount,
            authorizationId: paymentReceipt.authorizationId,
          },
          idempotencyKey,
        ),
      );

      paymentReceipt.captureId = captureResponse.data.captureId;
      paymentReceipt.capturedAt = new Date();
      paymentReceipt.state = PaymentReceiptStatus.CAPTURED;

      await queryRunner.manager.save(paymentReceipt);

      return {
        paymentReferenceId: paymentReceipt.id,
        paymentState: paymentReceipt.state,
        createAt: paymentReceipt.createdAt,
        currency: paymentReceipt.currency,
        amount: paymentReceipt.amount,
        pendingAt: paymentReceipt.pendingAt,
        authorizedAt: paymentReceipt.authorizedAt,
        capturedAt: paymentReceipt.capturedAt,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async refundPaymentReceipt(paymentReceiptId: string, idempotencyKey: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const paymentReceipt = await queryRunner.manager
        .createQueryBuilder(PaymentReceipt, 'pr')
        .setLock('pessimistic_write')
        .where('pr.id = :id', { id: paymentReceiptId })
        .getOneOrFail();

      if (paymentReceipt.state !== PaymentReceiptStatus.CAPTURED) {
        throw new HttpException(
          'Rejected: Payment Receipt is not in captured state',
          HttpStatus.BAD_REQUEST,
          {
            cause: 'Payment Receipt is not in captured state',
          },
        );
      }

      const refundResponse = await lastValueFrom(
        this.refundService.refund(
          {
            amount: paymentReceipt.amount,
            captureId: paymentReceipt.captureId,
          },
          idempotencyKey,
        ),
      );

      if (refundResponse instanceof HttpException) {
        throw new HttpException(
          'Rejected: Payment Receipt was rejected to be refunded',
          HttpStatus.FORBIDDEN,
          {
            cause: refundResponse,
          },
        );
      }

      paymentReceipt.refundId = refundResponse.data.refundId;
      paymentReceipt.refundedAt = new Date();
      paymentReceipt.state = PaymentReceiptStatus.REFUNDED;

      await queryRunner.manager.save(paymentReceipt);

      return {
        paymentReferenceId: paymentReceipt.id,
        paymentState: paymentReceipt.state,
        createAt: paymentReceipt.createdAt,
        currency: paymentReceipt.currency,
        amount: paymentReceipt.amount,
        pendingAt: paymentReceipt.pendingAt,
        authorizedAt: paymentReceipt.authorizedAt,
        capturedAt: paymentReceipt.capturedAt,
        refundedAt: paymentReceipt.refundedAt,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async voidPaymentReceipt(paymentReceiptId: string, idempotencyKey: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const paymentReceipt = await queryRunner.manager
        .createQueryBuilder(PaymentReceipt, 'pr')
        .setLock('pessimistic_write')
        .where('pr.id = :id', { id: paymentReceiptId })
        .getOneOrFail();

      if (paymentReceipt.state !== PaymentReceiptStatus.AUTHORIZED) {
        throw new HttpException(
          'Rejected: Payment Receipt is not in authorized state',
          HttpStatus.FORBIDDEN,
          {
            cause: 'Payment Receipt is not in authorized state',
          },
        );
      }

      const voidResponse = await lastValueFrom(
        this.voidService.void(
          { authorizationId: paymentReceipt.authorizationId },
          idempotencyKey,
        ),
      );

      if (voidResponse instanceof HttpException) {
        throw new HttpException(
          'Rejected: Payment Receipt was rejected to be voided',
          HttpStatus.FORBIDDEN,
          {
            cause: voidResponse,
          },
        );
      }

      paymentReceipt.voidId = voidResponse.data.voidId;
      paymentReceipt.voidedAt = new Date();
      paymentReceipt.state = PaymentReceiptStatus.VOIDED;

      await queryRunner.manager.save(paymentReceipt);

      return {
        paymentReferenceId: paymentReceipt.id,
        paymentState: paymentReceipt.state,
        createAt: paymentReceipt.createdAt,
        currency: paymentReceipt.currency,
        amount: paymentReceipt.amount,
        pendingAt: paymentReceipt.pendingAt,
        authorizedAt: paymentReceipt.authorizedAt,
        capturedAt: paymentReceipt.capturedAt,
        voidedAt: paymentReceipt.voidedAt,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
