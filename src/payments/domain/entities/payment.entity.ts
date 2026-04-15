import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IdempotencyKeyEntity } from './idempotency-keys.entity';
import { PaymentStatus } from '../constants';

@Entity('payments')
@Index('idx_customer_state', ['cardNumber', 'state'])
@Check('amount > 0')
@Check("currency = 'USD'")
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @Column()
  cardNumber: string;

  @Column()
  amount: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({
    type: 'simple-enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  state: string;

  @Column({ nullable: true })
  authorizationId: string;

  @Column({ nullable: true })
  captureId: string;

  @Column({ nullable: true })
  voidId: string;

  @Column({ nullable: true })
  refundId: string;

  @Column({ type: 'timestamptz', nullable: true })
  pendingAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  authorizedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  capturedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  voidedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;

  @OneToMany(
    () => IdempotencyKeyEntity,
    (idempotencyKey) => idempotencyKey.paymentId,
  )
  @JoinColumn({
    name: 'payment_id',
  })
  idempotencyKeys: string[];
}
