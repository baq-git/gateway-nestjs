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
import { Request } from 'express';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { IntersectionType } from '@nestjs/swagger';
import { PaymentService } from '@application/services/payment.service';
import { IdempotencyInterceptor } from '@infrastructure/idempotency/idempotency.interceptor';
import { CreateAuthorizePaymentRequestDto } from '@presentation/dtos/authorize-payment.dto';
import { type QueryRunner } from 'typeorm';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { Transaction } from '@common/transaction/transaction.decorator';

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

@Controller('payments')
@UseFilters(HttpExceptionFilter)
@UseInterceptors(IdempotencyInterceptor)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('/health')
  getPaymentHealth() {
    return this.paymentService.getHeath();
  }

  @Post('/authorize')
  async authorizePayment(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: AuthorizationInputDto,
    @Transaction() queryRunner: QueryRunner,
  ) {
    const idempotencyKey = request.get('Idempotency-Key') as string;

    return await this.paymentService.authorizePayment(
      queryRunner,
      body,
      idempotencyKey,
    );
  }
}
