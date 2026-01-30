import { Column, Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import { PaymentReceipt } from './payment-receipt.entity';
import { PaymentReceiptResponseSuccessDto } from 'src/dtos/payment-receipt/payment-receipt.dto';
import { HttpException } from '@nestjs/common';

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

  @Column({ type: 'simple-json', nullable: true })
  responseBody?: PaymentReceiptResponseSuccessDto | HttpException;

  @Column({ type: 'datetime', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'datetime' })
  expiresAt: Date;
}
