import {
  Column,
  Entity,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { HttpException } from '@nestjs/common';
import { PaymentResponseSuccessDto } from '@presentation/dtos/responses/payments.dto';
import { PaymentEntity } from '@domain/entities/payment.entity';

const UNIQUE_IDEMPOTENCY_KEY_CONSTRAINT = 'unique_idempotency_key_constraint';

@Entity('idempotency_keys')
@Unique(UNIQUE_IDEMPOTENCY_KEY_CONSTRAINT, ['key'])
export class IdempotencyKeyEntity {
  @PrimaryColumn({ type: 'uuid', unique: true })
  key: string;

  @ManyToOne(() => PaymentEntity, (payment) => payment.id)
  payment: PaymentEntity;

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

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  updateAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date;
}
