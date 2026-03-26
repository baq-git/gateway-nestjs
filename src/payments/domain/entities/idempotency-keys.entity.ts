import { Column, Entity, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { HttpException } from '@nestjs/common';
import { PaymentResponseSuccessDto } from '@presentation/dtos/responses/payments.dto';
import { Payment } from '@domain/entities/payment.entity';

@Entity('idempotency_keys')
export class IdempotencyKeyEntity {
  @PrimaryColumn({ unique: true, type: 'uuid' })
  key: string;

  @ManyToOne(() => Payment, (payment) => payment.id)
  payment: Payment;

  @Column({ nullable: true })
  requestPath: string;

  @Column({ type: 'varchar', nullable: false })
  requestHash: string;

  @Column()
  operation: 'processing' | 'success' | 'failure';

  @Column({ type: 'int', nullable: true })
  responseStatus?: number;

  @Column({ type: 'simple-json', nullable: true })
  responseBody?: PaymentResponseSuccessDto | HttpException;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  updateAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date;
}
