import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from '@domain/entities/idempotency-keys.entity';
import { IdempotencyService } from '@infrastructure/idempotency/idempotency.service';
import { PaymentController } from '@presentation/controllers/payments.controller';
import { PaymentService } from '@application/services/payment.service';
import { Payment } from '@domain/entities/payment.entity';
import { MockbankModule } from '@infrastructure/adapters/bank/mockbank/mockbank.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, IdempotencyKey]),
    MockbankModule,
  ],
  providers: [PaymentService, IdempotencyService, MockbankModule],
  controllers: [PaymentController],
})
export class PaymentModule {}
