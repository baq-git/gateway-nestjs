import { TestingModule, Test } from '@nestjs/testing';
import { PaymentService } from '../payment.service';
import { BankPort } from '@infrastructure/adapters/bank/bank.port';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { PaymentEvent } from '@domain/statemachine/payment.statemachine';
import { PaymentEntity } from '@domain/entities/payment.entity';
import { Repository, QueryRunner } from 'typeorm';
import { AuthorizationResponseDto } from '@infrastructure/adapters/bank/mockbank/dtos/responses/authorize-mockbank.response.dto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MockBankAdapter } from '@infrastructure/adapters/bank/mockbank/mockbank.adapter';
import { CheckoutRequestDto } from '@application/dtos/request/payment.request.dto';
import { REQUEST } from '@nestjs/core';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PaymentStatus } from '@domain/constants';
import { CreateAuthorizationMockBankRequestDto } from '@payments/infrastructure/adapters/bank/mockbank/dtos/requests/authorize-mockbank.request.dto';

describe('PaymentService', () => {
  let service: PaymentService;
  let mockBankPort: DeepMocked<BankPort>;
  let mockPaymentRepository: DeepMocked<Repository<PaymentEntity>>;
  let mockQueryRunner: DeepMocked<QueryRunner>;
  let mockStateMachine: any;

  beforeEach(async () => {
    mockBankPort = createMock<BankPort>();
    mockPaymentRepository = createMock<Repository<PaymentEntity>>();
    mockQueryRunner = createMock<QueryRunner>();
    const mockRequest = {
      path: '/payments/authorize',
      queryRunner: mockQueryRunner,
      get: jest.fn().mockImplementation((headerName: string) => {
        if (headerName === 'idempotency-key')
          return 'a3919f91-19b9-4bcd-95a4-e9276d956173';

        return null;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: MockBankAdapter,
          useValue: mockBankPort,
        },
        {
          provide: getRepositoryToken(PaymentEntity),
          useValue: mockPaymentRepository,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    service = await module.resolve<PaymentService>(PaymentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authorize()', () => {
    it('should successfully authorize payment and transition state', async () => {
      const validCheckoutRequest: CheckoutRequestDto = {
        orderId: '1cf9093e-cf30-4364-ba65-41661cb3832c',
        customerId: 'CUST-001',
        amount: 250.5,
        cardInfo: {
          cardNumber: '4111111111111111',
          expiryMonth: 12,
          expiryYear: 2025,
          cvv: '123',
        },
      };

      const mockBankResponse: AuthorizationResponseDto = {
        amount: 250.5,
        authorizationId: 'auth_34fe4383-42ab-4bb5-84d1-2033adb43497',
        createdAt: new Date().toString(),
        currency: 'USD',
        expiresAt: Date.now().toString(),
        status: PaymentStatus.AUTHORIZED,
      };

      mockStateMachine = {
        authorize: jest.fn(),
        getState: jest.fn().mockReturnValue(PaymentStatus.AUTHORIZED),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(mockStateMachine);

      mockBankPort.authorize.mockResolvedValue(mockBankResponse);

      const result = await service.authorize(
        validCheckoutRequest,
        mockQueryRunner,
      );

      expect(mockBankPort.authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: mockBankResponse.amount,
          cardNumber: expect.any(String),
        }),
        expect.any(String),
      );

      expect(mockStateMachine.authorize).toHaveBeenCalledWith(
        PaymentEvent.AUTHORIZE_SUCCESS,
      );
      expect(mockQueryRunner.manager.createQueryBuilder).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('should throw error if state transition is invalid', async () => {
      const validCheckoutRequest: CheckoutRequestDto = {
        orderId: '1cf9093e-cf30-4364-ba65-41661cb3832c',
        customerId: 'CUST-001',
        amount: 250.5,
        cardInfo: {
          cardNumber: '4111111111111111',
          expiryMonth: 12,
          expiryYear: 2025,
          cvv: '123',
        },
      };

      mockStateMachine = {
        authorize: jest.fn().mockImplementation(),
        getState: jest.fn().mockReturnValue(PaymentStatus.PENDING),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(mockStateMachine);

      await expect(
        service.authorize(validCheckoutRequest, mockQueryRunner),
      ).rejects.toBeInstanceOf(HttpException);

      await expect(
        service.authorize(validCheckoutRequest, mockQueryRunner),
      ).rejects.toThrow(HttpException);

      try {
        await service.authorize(validCheckoutRequest, mockQueryRunner);
      } catch (error) {
        expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(error.response).toContain('Invalid State Transition:');
        expect(error.response).toContain(mockStateMachine.authorize.name);
      }
    });

    it('should propagate error when bank fails', async () => {
      const validCheckoutRequest: CheckoutRequestDto = {
        orderId: '1cf9093e-cf30-4364-ba65-41661cb3832c',
        customerId: 'CUST-001',
        amount: 250.5,
        cardInfo: {
          cardNumber: '4111111111111111',
          expiryMonth: 12,
          expiryYear: 2025,
          cvv: '123',
        },
      };

      const bankError = new Error('Insufficient Funds');
      mockBankPort.authorize.mockRejectedValue(bankError);

      mockStateMachine = {
        authorize: jest.fn(),
      };

      await expect(
        service.authorize(validCheckoutRequest, mockQueryRunner),
      ).rejects.toThrow('Insufficient Funds');

      expect(mockStateMachine.authorize).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should save PaymentEntity with correct data', async () => {
      mockQueryRunner.manager.createQueryBuilder.mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          generatedMaps: [
            {
              id: '2b24413e-3cf7-4d7f-a2a9-ca5c0593c5b1',
            },
          ],
        }),
      } as any);

      const validCheckoutRequest: CheckoutRequestDto = {
        orderId: 'd1ab4a57-71a7-4ee0-a07b-f7ddc6ff46f6',
        customerId: 'CUST-001',
        amount: 500,
        cardInfo: {
          cardNumber: '4111111111111111',
          expiryMonth: 10,
          expiryYear: 2028,
          cvv: '999',
        },
      };

      const mockBankResponse: AuthorizationResponseDto = {
        amount: 500,
        authorizationId: 'auth_real_deal_123',
        createdAt: new Date().toISOString(),
        currency: 'USD',
        expiresAt: '2028-10-01',
        status: PaymentStatus.AUTHORIZED,
      };

      mockBankPort.authorize.mockResolvedValue(mockBankResponse);

      mockStateMachine = {
        authorize: jest.fn(),
        getState: jest.fn().mockReturnValue(PaymentStatus.AUTHORIZED),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(mockStateMachine);

      const mockInsertResult = {
        generatedMaps: [{ id: '2b24413e-3cf7-4d7f-a2a9-ca5c0593c5b1' }],
      };

      const result = await service.authorize(
        validCheckoutRequest,
        mockQueryRunner,
      );

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        PaymentEntity,
        expect.objectContaining({
          orderId: validCheckoutRequest.orderId,
          cardNumber: validCheckoutRequest.cardInfo.cardNumber,
          amount: mockBankResponse.amount,
          currency: mockBankResponse.currency,
          authorizationId: mockBankResponse.authorizationId,
          state: PaymentStatus.AUTHORIZED, // Trạng thái lấy từ State Machine
          idempotencyKeys: expect.arrayContaining([
            'a3919f91-19b9-4bcd-95a4-e9276d956173',
          ]),
        }),
      );

      expect(result).toEqual(mockInsertResult.generatedMaps[0]);

      const qb = mockQueryRunner.manager.createQueryBuilder();

      expect(mockQueryRunner.manager.createQueryBuilder).toHaveBeenCalled();

      expect(qb.insert().into).toHaveBeenCalledWith(PaymentEntity);
      expect(qb.execute).toHaveBeenCalled();
    });
  });
});
