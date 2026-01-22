import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MockbankModule } from './mockbank/mockbank.module';
import { PaymentReceiptModule } from './payment-receipt/payment-receipt.module';
import { PaymentReceipt } from './payment-receipt/entity/payment-receipt.entity';
import { IdempotencyKey } from './payment-receipt/entity/idempotency-keys.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'paymentgateway',
      entities: [PaymentReceipt, IdempotencyKey],

      // Setting synchronize: true shouldn't be used in production
      // - otherwise you can lose production data.
      synchronize: true,
    }),
    MockbankModule,
    PaymentReceiptModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {}
}
