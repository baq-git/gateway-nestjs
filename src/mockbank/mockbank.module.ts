import { Module } from '@nestjs/common';
import { MockbankController } from './mockbank.controller';
import { HttpModule } from '@nestjs/axios';
import { MockbankHttpService } from './mockbank-http.service';
import { IdempotencyKey } from '../payment-receipt/entity/idempotency-keys.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentReceipt } from '../payment-receipt/payment-receipt';
import { MockbankService } from './mockbank.service';
import { AuthorizeService } from './authorize/authorize.service';
import { CaptureService } from './capture/capture.service';
import { RefundService } from './refund/refund.service';
import { VoidService } from './void/void.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentReceipt, IdempotencyKey]),
    HttpModule.register({ timeout: 5000, maxRedirects: 5 }),
  ],
  providers: [
    MockbankService,
    MockbankHttpService,
    AuthorizeService,
    CaptureService,
    RefundService,
    VoidService,
    IdempotencyKey,
  ],
  controllers: [MockbankController],
  exports: [
    MockbankService,
    AuthorizeService,
    CaptureService,
    RefundService,
    VoidService,
  ],
})
export class MockbankModule {}
