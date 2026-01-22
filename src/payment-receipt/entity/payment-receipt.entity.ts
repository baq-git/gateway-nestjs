import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IdempotencyKey } from './idempotency-keys.entity';

export enum PaymentReceiptStatus {
  PENDING = 'pending',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  VOIDED = 'voided',
  REFUNDED = 'refunded',
}

@Entity('payment_receipts')
@Index('idx_customer_state', ['cardNumber', 'state'])
@Check('amount > 0')
@Check("currency = 'USD'")
export class PaymentReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column()
  cardNumber: string;

  @Column()
  amount: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentReceiptStatus,
    default: PaymentReceiptStatus.PENDING,
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
    () => IdempotencyKey,
    (idempotencyKey) => idempotencyKey.paymentReceipt,
  )
  @JoinColumn({
    name: 'payment_receipt_id',
  })
  idempotencyKeys: string[];
}
