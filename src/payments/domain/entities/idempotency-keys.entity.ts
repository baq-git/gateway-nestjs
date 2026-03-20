import { Column, Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import { HttpException } from '@nestjs/common';
import { PaymentReceiptResponseSuccessDto } from '@presentation/dtos/responses/payments.dto';
import { PaymentReceipt } from '@domain/entities/payment.entity';

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

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date;
}
