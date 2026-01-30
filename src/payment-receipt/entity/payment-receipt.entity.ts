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
    type: 'simple-enum',
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

  @Column({ type: 'datetime', nullable: true })
  pendingAt: Date;

  @Column({ type: 'datetime', nullable: true })
  authorizedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  capturedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  voidedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  refundedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date;

  @Column({ type: 'datetime', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'datetime', default: () => 'NOW()' })
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
