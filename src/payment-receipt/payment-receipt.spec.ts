import { Test, TestingModule } from '@nestjs/testing';
import { PaymentReceipt } from './payment-receipt';

describe('PaymentReceipt', () => {
  let provider: PaymentReceipt;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentReceipt],
    }).compile();

    provider = module.get<PaymentReceipt>(PaymentReceipt);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
