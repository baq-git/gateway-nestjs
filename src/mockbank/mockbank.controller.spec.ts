import { Test, TestingModule } from '@nestjs/testing';
import { MockbankController } from './mockbank.controller';
import { MockbankService } from './mockbank.service';
import { mock } from 'node:test';
import { of } from 'rxjs';
import {
  CreateAuthorizePaymentRequestDto,
  CreateAuthorizePaymentResponseDto,
} from 'src/payment-receipt/dtos/authorize-payment.dto';

describe('MockbankController', () => {
  let controller: MockbankController;

  const mockBankService = {
    getHealth: jest.fn(),
    authorizations: jest.fn(),
    getAuthorization: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MockbankController],
      providers: [
        {
          provide: MockbankService,
          useValue: mockBankService,
        },
      ],
    }).compile();

    controller = module.get<MockbankController>(MockbankController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(mockBankService).toBeDefined();
  });

  describe('GET /mockbank/health', () => {
    it('should call getHealth on the service and return its result', async () => {
      const mockResponse = { status: 'healthy' };

      mockBankService.getHealth.mockReturnValue(of(mockResponse));

      controller.getMockbankHealth().subscribe((result) => {
        expect(result).toBe(mockResponse);
      });

      expect(mockBankService.getHealth).toHaveBeenCalledTimes(1);
      expect(mockBankService.getHealth).toHaveBeenCalledWith();
    });
  });

  describe('POST /mockbank/authorizations', () => {
    it('should call authorizations with the DTO and return result', () => {
      const createDto: CreateAuthorizePaymentRequestDto = {
        amount: 5000,
        cardNumber: '4111111111111111',
        cvv: '123',
        expiryMonth: 12,
        expiryYear: 2028,
      };

      const createAuthorizationsResponse: CreateAuthorizePaymentResponseDto = {
        amount: 5000,
        authorizationId: `auth_550e8400-e29b-41d4-a716-446655440000`,
        createdAt: new Date(),
        currency: 'USD',
        expiresAt: new Date(),
        status: 'approved',
      };

      mockBankService.authorizations.mockReturnValue(
        of(createAuthorizationsResponse),
      );

      controller.authorize(createDto).subscribe((result) => {
        expect(result).toBe(createAuthorizationsResponse);
      });
    });
  });
});
