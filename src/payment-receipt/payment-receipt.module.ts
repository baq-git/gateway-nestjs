import { Module } from '@nestjs/common';
import { PaymentReceiptController } from './payment-receipt.controller';
import { PaymentReceiptService } from './payment-receipt.service';
import { PaymentReceipt } from './entity/payment-receipt.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from './entity/idempotency-keys.entity';
import { MockbankModule } from 'src/mockbank/mockbank.module';
import { IdempotencyService } from './idempotency/idempotency.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentReceipt, IdempotencyKey]),
    MockbankModule,
  ],
  providers: [PaymentReceiptService, IdempotencyService, MockbankModule],
  controllers: [PaymentReceiptController],
})
export class PaymentReceiptModule {}
