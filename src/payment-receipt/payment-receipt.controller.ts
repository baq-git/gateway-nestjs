import {
  Controller,
  Get,
  Post,
  UseFilters,
  Req,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PaymentReceiptService } from './payment-receipt.service';
import { HttpExceptionFilter } from 'src/mockbank/http-exception.filter';
import { type Request } from 'express';
import { IsNotEmpty, isUUID, IsUUID } from 'class-validator';
import { IntersectionType } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { IdempotencyService } from './idempotency/idempotency.service';
import { PaymentReceiptStatus } from './entity/payment-receipt.entity';
import { CreateAuthorizePaymentRequestDto } from 'src/dtos/mockbank/authorize-payment.dto';

class PaymentReceiptInputDto {
  @IsUUID(4, {
    message: 'Invalid paymentReceiptId: Maybe it is not a valid UUID',
  })
  paymentReceiptId!: string;
}

class ClientAuthorizationInputDto {
  @IsUUID(4, {
    message: 'Invalid orderId: Maybe it is not a valid UUID',
  })
  @IsNotEmpty({ message: 'orderId is required' })
  orderId!: string;
}

class AuthorizationInputDto extends IntersectionType(
  CreateAuthorizePaymentRequestDto,
  ClientAuthorizationInputDto,
) {}

@Controller('payment-receipt')
@UseFilters(HttpExceptionFilter)
export class PaymentReceiptController {
  constructor(
    private readonly paymentService: PaymentReceiptService,
    private readonly idempotencyService: IdempotencyService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('/health')
  getPaymentHealth() {
    return this.paymentService.getHeath();
  }

  @Post('/authorize')
  async authorizePaymentReceipt(
    @Req() request: Request,
    @Body() body: AuthorizationInputDto,
  ) {
    const idempotencyKey = request.get('Idempotency-Key') as string;

    if (!idempotencyKey) {
      throw new HttpException(
        "Header 'idempotency-key' is required",
        HttpStatus.BAD_REQUEST,
        {
          cause: 'Missing Idempotency-Key header',
        },
      );
    }

    if (!isUUID(idempotencyKey)) {
      throw new HttpException(
        "Header 'idempotency-key' is not a valid UUID",
        HttpStatus.BAD_REQUEST,
      );
    }

    const { orderId, ...data } = body;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log('idempotencyKey', idempotencyKey);
      const idempotencyCheckResult =
        await this.idempotencyService.ensureCreatedAndCheckIdempotencyKey(
          request,
          idempotencyKey,
          queryRunner,
        );

      if (
        idempotencyCheckResult.idempotencyMetadata &&
        idempotencyCheckResult.idempotencyMetadata.operation === 'processing'
      ) {
        console.log(
          'processing concurrent case',
          idempotencyCheckResult.idempotencyMetadata,
        );
        return idempotencyCheckResult;
      }

      if (
        idempotencyCheckResult.idempotencyMetadata &&
        idempotencyCheckResult.idempotencyMetadata.operation === 'success'
      ) {
        console.log('success concurrent case');
        return idempotencyCheckResult;
      }

      if (
        idempotencyCheckResult.idempotencyMetadata &&
        idempotencyCheckResult.idempotencyMetadata.operation === 'failure'
      ) {
        console.log('failure concurrent case');
        return idempotencyCheckResult;
      }

      const result = await this.paymentService
        .authorizePaymentReceipt(
          { orderId, ...data },
          idempotencyKey,
          queryRunner,
        )
        .then(async (response) => {
          if (
            response.statusCode === HttpStatus.CREATED &&
            response.data.paymentState === PaymentReceiptStatus.AUTHORIZED
          ) {
            const idempotencyUpdateResult =
              await this.idempotencyService.updateToSuccessIdempotency(
                idempotencyKey,
                response,
                queryRunner,
              );

            return {
              idempotencyMetadata: {
                ...idempotencyUpdateResult,
              },
              paymentReceipt: {
                ...response,
              },
            };
          }
        })
        .catch(async (error) => {
          const idempotencyUpdateResult =
            await this.idempotencyService.updateToFailureIdempotency(
              idempotencyKey,
              error,
              queryRunner,
            );

          return {
            idempotencyMetadata: {
              ...idempotencyUpdateResult,
            },
            paymentReceipt: {
              statusCode: error.status,
              statusText: error.cause.statusText,
              payload: error.cause.data,
            },
          };
        });

      await queryRunner.commitTransaction();

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
        { cause: error },
      );
    } finally {
      await queryRunner.release();
    }
  }

  @Post('/capture')
  capturePaymentReceipt(
    @Req() request: Request,
    @Body()
    body: PaymentReceiptInputDto,
  ) {
    const idempotencyKey = request.get('idempotency-key') as string;
    const { paymentReceiptId } = body;

    return this.paymentService.capturePaymentReceipt(
      paymentReceiptId,
      idempotencyKey,
    );
  }

  @Post('/refund')
  refundPaymentReceipt(
    @Req() request: Request,
    @Body()
    body: PaymentReceiptInputDto,
  ) {
    const idempotencyKey = request.get('idempotency-key') as string;
    const { paymentReceiptId } = body;

    return this.paymentService.refundPaymentReceipt(
      paymentReceiptId,
      idempotencyKey,
    );
  }

  @Post('/void')
  voidPaymentReceipt(
    @Req() request: Request,
    @Body()
    body: PaymentReceiptInputDto,
  ) {
    const idempotencyKey = request.get('idempotency-key') as string;
    const { paymentReceiptId } = body;

    return this.paymentService.voidPaymentReceipt(
      paymentReceiptId,
      idempotencyKey,
    );
  }
}
