import { MockbankService } from '@infrastructure/adapters/bank/mockbank/services/mockbank.service';
import { Test, TestingModule } from '@nestjs/testing';
import { AxiosResponse } from 'axios';
import { PaymentService } from '../payment.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let mockbankService: MockbankService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentService],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
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
