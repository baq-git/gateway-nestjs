import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from '@domain/entities/payment.entity';
import { IdempotencyKeyEntity } from '@domain/entities/idempotency-keys.entity';

export class TestDatabase {
  private static container: StartedPostgreSqlContainer;

  static async start() {
    this.container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('paymentgatewaytest')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();

    return {
      host: this.container.getHost(),
      port: this.container.getPort(),
    };
  }

  static async stop() {
    if (this.container) {
      await this.container.stop();
    }
  }

  static getTypeOrmConfig(connection: { host: string; port: number }) {
    return TypeOrmModule.forRoot({
      type: 'postgres',
      host: connection.host,
      port: connection.port,
      username: 'postgres',
      password: 'postgres',
      database: 'paymentgatewaytest',
      entities: [PaymentEntity, IdempotencyKeyEntity],
      autoLoadEntities: true,
      synchronize: true,
    });
  }
}
