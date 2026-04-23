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
import { PaymentService } from '@application/services/payment.service';
import { IdempotencyInterceptor } from '@infrastructure/idempotency/idempotency.interceptor';
import { type QueryRunner } from 'typeorm';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { Transactional } from '@payments/common/transaction/transaction.decorator';
import { CheckoutRequestDto } from '@payments/application/dtos/request/payment.request.dto';

@Controller('payments')
@UseFilters(HttpExceptionFilter)
@UseInterceptors(IdempotencyInterceptor)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('/health')
  getPaymentHealth() {}

  @Post('/authorize')
  async authorizePayment(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: CheckoutRequestDto,
    @Transactional() queryRunner: QueryRunner,
  ) {
    const idempotencyKey = request.get('Idempotency-Key') as string;
    const result = await this.paymentService.authorize(body, queryRunner);

    return result;
  }

  // @Post('/capture')
  // async capturePayment(
  //   @Req() request: RawBodyRequest<Request>,
  //
  // )
}
