import {
  Controller,
  Get,
  Post,
  UseFilters,
  Req,
  Body,
  type RawBodyRequest,
  UseInterceptors,
} from '@nestjs/common';
import { PaymentReceiptService } from './payment-receipt.service';
import { HttpExceptionFilter } from 'src/mockbank/http-exception.filter';
import { Request } from 'express';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { IntersectionType } from '@nestjs/swagger';
import { CreateAuthorizePaymentRequestDto } from 'src/dtos/mockbank/authorize-payment.dto';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { type QueryRunner } from 'typeorm';
import { Transaction } from './transaction/transaction.decorator';

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
@UseInterceptors(IdempotencyInterceptor)
export class PaymentReceiptController {
  constructor(private readonly paymentService: PaymentReceiptService) {}

  @Get('/health')
  getPaymentHealth() {
    return this.paymentService.getHeath();
  }

  @Post('/authorize')
  async authorizePaymentReceipt(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: AuthorizationInputDto,
    @Transaction() queryRunner: QueryRunner,
  ) {
    const idempotencyKey = request.get('Idempotency-Key') as string;

    return await this.paymentService.authorizePaymentReceipt(
      queryRunner,
      body,
      idempotencyKey,
    );
  }
}
