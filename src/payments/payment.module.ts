import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from '@domain/entities/idempotency-keys.entity';
import { IdempotencyService } from '@infrastructure/idempotency/idempotency.service';
import { PaymentReceiptController } from '@presentation/controllers/payments.controller';
import { PaymentReceiptService } from '@application/services/payment.service';
import { PaymentReceipt } from '@domain/entities/payment.entity';
import { MockbankModule } from '@infrastructure/adapters/bank/mockbank/mockbank.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentReceipt, IdempotencyKey]),
    MockbankModule,
  ],
  providers: [PaymentReceiptService, IdempotencyService, MockbankModule],
  controllers: [PaymentReceiptController],
})
export class PaymentReceiptModule {}
