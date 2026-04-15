import { PaymentEntity } from '@domain/entities/payment.entity';

export class PaymentResponseSuccessDto {
  statusCode!: number;
  message!: string;
  data!: PaymentEntity;
}
