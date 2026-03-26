import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from '@domain/entities/idempotency-keys.entity';
import { Payment } from '@domain/entities/payment.entity';
import { MockbankModule } from '@infrastructure/adapters/bank/mockbank/mockbank.module';
import { PaymentModule } from 'payments/payment.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'paymentgateway',
      entities: [Payment, IdempotencyKey],

      // Setting synchronize: true shouldn't be used in production
      // - otherwise you can lose production data.
      synchronize: true,
    }),
    MockbankModule,
    PaymentModule,
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {}
}
