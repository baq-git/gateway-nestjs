import { Test, TestingModule } from '@nestjs/testing';
import { PaymentReceiptService } from './payment-receipt.service';
import { AxiosResponse } from 'axios';
import { MockbankService } from 'src/mockbank/mockbank.service';

describe('PaymentReceiptService', () => {
  let service: PaymentReceiptService;
  let mockbankService: MockbankService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentReceiptService],
    }).compile();

    service = module.get<PaymentReceiptService>(PaymentReceiptService);
    mockbankService = module.get<MockbankService>(MockbankService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHeath', () => {
    it('should return the health status', async () => {
      const mockResponse: AxiosResponse<{ status: string }> = {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as any },
        data: { status: 'healthy' },
      };
    });
  });
});
