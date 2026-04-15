import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from '@payments/domain/entities/payment.entity';
import { IdempotencyKeyEntity } from '@payments/domain/entities/idempotency-keys.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity, IdempotencyKeyEntity]),
    HttpModule.register({ timeout: 5000, maxRedirects: 5 }),
  ],
})
export class MockbankModule {}
