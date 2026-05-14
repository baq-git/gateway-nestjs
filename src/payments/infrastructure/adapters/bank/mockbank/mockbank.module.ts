import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from '@payments/domain/entities/payment.entity';
import { IdempotencyKeyEntity } from '@payments/domain/entities/idempotency-keys.entity';
import { MockBankAdapter } from './mockbank.adapter';
import { MockBankHttpService } from './mockbank.http.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity, IdempotencyKeyEntity]),
    HttpModule.register({ timeout: 5000, maxRedirects: 5 }),
  ],
  providers: [MockBankAdapter, MockBankHttpService],
  exports: [MockBankAdapter],
})
export class MockbankModule {}
