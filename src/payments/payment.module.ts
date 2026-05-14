import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyService } from '@infrastructure/idempotency/idempotency.service';
import { PaymentController } from '@presentation/controllers/payments.controller';
import { PaymentService } from '@application/services/payment.service';
import { MockbankModule } from '@infrastructure/adapters/bank/mockbank/mockbank.module';
import { PaymentEntity } from './domain/entities/payment.entity';
import { IdempotencyKeyEntity } from './domain/entities/idempotency-keys.entity';
import { MockBankAdapter } from './infrastructure/adapters/bank/mockbank/mockbank.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity, IdempotencyKeyEntity]),
    MockbankModule,
  ],
  providers: [PaymentService, IdempotencyService],
  controllers: [PaymentController],
})
export class PaymentModule {}
