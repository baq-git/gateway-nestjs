import { Module } from '@nestjs/common';
import { MockbankController } from './mockbank.controller';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from '@domain/entities/idempotency-keys.entity';
import { Payment } from '@domain/entities/payment.entity';
import { AuthorizeService } from './services/authorize.service';
import { CaptureService } from './services/capture.service';
import { MockbankHttpService } from './services/mockbank-http.service';
import { MockbankService } from './services/mockbank.service';
import { RefundService } from './services/refund.service';
import { VoidService } from './services/void.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, IdempotencyKey]),
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
