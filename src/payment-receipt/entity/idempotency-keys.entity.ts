import { Column, Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import { PaymentReceipt } from './payment-receipt.entity';

@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn()
  key: string;

  @ManyToOne(() => PaymentReceipt, (paymentReceipt) => paymentReceipt.id)
  paymentReceipt: PaymentReceipt;

  @Column({ nullable: true })
  requestPath: string;

  @Column({ type: 'varchar', nullable: false })
  requestHash: string;

  @Column()
  operation: 'processing' | 'success' | 'failure';

  @Column({ type: 'int', nullable: true })
  responseStatus?: number;

  @Column({ type: 'jsonb', nullable: true })
  responseBody?: any;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
