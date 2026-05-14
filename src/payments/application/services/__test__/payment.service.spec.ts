import { TestingModule, Test } from '@nestjs/testing';
import { PaymentService } from '../payment.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { PaymentEntity } from '@domain/entities/payment.entity';
import { QueryRunner } from 'typeorm';
import { MockBankAdapter } from '@infrastructure/adapters/bank/mockbank/mockbank.adapter';
import { REQUEST } from '@nestjs/core';
import { CheckoutRequestDto } from '@payments/application/dtos/request/payment.request.dto';
import { PaymentStatus } from '@domain/constants';
import { AuthorizationResponseDto } from '@payments/infrastructure/adapters/bank/mockbank/dtos/responses/authorize-mockbank.response.dto';
import { BankPort } from '@infrastructure/adapters/bank/bank.port';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CaptureResponseDto } from '@payments/infrastructure/adapters/bank/mockbank/dtos/responses/capture-mockbank.response.dto';
import { PaymentEvent } from '@domain/statemachine/payment.statemachine';
import { VoidResponseDto } from '@payments/infrastructure/adapters/bank/mockbank/dtos/responses/void-mockbank.response.dto';
import { RefundResponseDto } from '@payments/infrastructure/adapters/bank/mockbank/dtos/responses/refund-mockbank.response.dto';

describe('PaymentService', () => {
  let service: PaymentService;
  let mockBankPort: DeepMocked<BankPort>;
  let mockQueryRunner: DeepMocked<QueryRunner>;
  let stateMachine: any;

  beforeEach(async () => {
    mockBankPort = createMock<MockBankAdapter>();
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
        PaymentEntity,
        {
          provide: MockBankAdapter,
          useValue: mockBankPort,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    service = await module.resolve<PaymentService>(PaymentService);
    mockBankPort = module.get(MockBankAdapter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('authorize()', () => {
    it('Success Case: should successfully authorize payment and transition state ', async () => {
      mockQueryRunner.manager.createQueryBuilder.mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        create: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          generatedMaps: [
            {
              id: '2b24413e-3cf7-4d7f-a2a9-ca5c0593c5b1',
            },
          ],
        }),
      } as any);

      mockQueryRunner.manager.getRepository.mockReturnValue({
        findOne: jest.fn().mockReturnValue(null),
      } as any);

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

      stateMachine = {
        authorize: jest.fn(),
        getState: jest.fn().mockReturnValue(PaymentStatus.AUTHORIZED),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(stateMachine);

      mockBankPort.authorize.mockResolvedValueOnce(mockBankResponse);

      const result = await service.authorize(
        validCheckoutRequest,
        mockQueryRunner,
      );

      await service.authorize(validCheckoutRequest, mockQueryRunner);

      expect(mockBankPort.authorize).toHaveBeenCalled();
      expect(stateMachine.authorize).toHaveBeenCalled();
      expect(stateMachine.getState).toHaveBeenCalled();
      expect(stateMachine.getState).toHaveBeenCalled();

      expect(mockBankPort.authorize).toHaveBeenCalledWith(
        {
          amount: validCheckoutRequest.amount,
          cardNumber: validCheckoutRequest.cardInfo.cardNumber,
          cvv: validCheckoutRequest.cardInfo.cvv,
          expiryMonth: validCheckoutRequest.cardInfo.expiryMonth,
          expiryYear: validCheckoutRequest.cardInfo.expiryYear,
        },
        'a3919f91-19b9-4bcd-95a4-e9276d956173',
      );

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        PaymentEntity,
        expect.objectContaining({
          customerId: validCheckoutRequest.customerId,
          orderId: validCheckoutRequest.orderId,
          state: PaymentStatus.AUTHORIZED,
        }),
      );

      expect(mockQueryRunner.manager.createQueryBuilder).toHaveBeenCalled();

      expect(result).toEqual({
        id: '2b24413e-3cf7-4d7f-a2a9-ca5c0593c5b1',
      });
    });

    it('Failure Case: should save payment record with FAILED state when Bank returns 4xx error', async () => {
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

      const bankError = new HttpException(
        'Invalid Card',
        HttpStatus.BAD_REQUEST,
      );

      stateMachine = {
        authorize: jest.fn(),
        getState: jest
          .fn()
          .mockReturnValueOnce(PaymentStatus.PENDING)
          .mockReturnValue(PaymentStatus.FAILED),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(stateMachine);

      mockBankPort.authorize.mockRejectedValue(bankError);
      mockQueryRunner.manager.getRepository.mockReturnValue({
        findOne: jest.fn().mockReturnValue(null),
      } as any);

      mockQueryRunner.manager.create.mockImplementation(
        (_, data) => data as any,
      );

      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          generatedMaps: [{ id: 'b64043a6-bfa3-4e37-b153-452b4846bf55' }],
        }),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(
        mockInsertQuery as any,
      );

      await service.authorize(validCheckoutRequest, mockQueryRunner);

      expect(mockBankPort.authorize).toHaveBeenCalled();
      expect(mockInsertQuery.execute).toHaveBeenCalled();
      expect(stateMachine.authorize).toHaveBeenCalledWith(
        PaymentEvent.AUTHORIZE_FAILURE,
      );
      expect(stateMachine.getState).toHaveBeenCalled();
      expect(mockInsertQuery.values).toHaveBeenCalledWith([
        expect.objectContaining({
          state: PaymentStatus.FAILED,
          orderId: validCheckoutRequest.orderId,
        }),
      ]);
    });

    it('Failure Case: should throw error and NOT save when Bank returns 500 error', async () => {
      const validCheckoutRequest: CheckoutRequestDto = {
        orderId: 'order-err-123',
        customerId: 'CUST-001',
        amount: 500,
        cardInfo: {
          cardNumber: '4111111111111111',
          expiryMonth: 12,
          expiryYear: 2025,
          cvv: '123',
        },
      };

      const systemError = new HttpException(
        'Bank Down',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      mockBankPort.authorize.mockRejectedValue(systemError);

      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(
        mockInsertQuery as any,
      );

      mockQueryRunner.manager.getRepository.mockReturnValue({
        findOne: jest.fn().mockReturnValue(null),
      } as any);

      await expect(
        service.authorize(validCheckoutRequest, mockQueryRunner),
      ).rejects.toThrow(systemError);

      expect(mockBankPort.authorize).toHaveBeenCalled();
      expect(mockInsertQuery.execute).not.toHaveBeenCalled();
    });

    it('Failure Case: should throw ConflictException when payment for orderId already exists', async () => {
      const duplicateRequest: CheckoutRequestDto = {
        orderId: 'existing-order-123',
        customerId: 'CUST-001',
        amount: 100,
        cardInfo: {
          cardNumber: '4111...',
          expiryMonth: 12,
          expiryYear: 2025,
          cvv: '123',
        },
      };

      const existingPayment = {
        id: '5f35b215-d0b3-4ce1-94f3-abebd2162b90',
        orderId: 'existing-order-123',
        state: PaymentStatus.AUTHORIZED,
      };

      mockQueryRunner.manager
        .getRepository(PaymentEntity)
        .createQueryBuilder()
        .getOne.mockResolvedValue(existingPayment);

      await expect(
        service.authorize(duplicateRequest, mockQueryRunner),
      ).rejects.toThrow(HttpException);

      try {
        await service.authorize(duplicateRequest, mockQueryRunner);
      } catch (error) {
        expect(error.message).toContain(
          `Payment for this order already exists with status`,
        );
      }

      expect(mockBankPort.authorize).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.insert).not.toHaveBeenCalled();
    });
  });

  describe('capture()', () => {
    it('Success Case: should successfully capture payment and transition state', async () => {
      const mockLockedPayment = {
        id: '5326526d-9aa7-4e14-a6d4-3284886da5df',
        state: PaymentStatus.AUTHORIZED,
        amount: 250.5,
        authorizationId: 'auth_34fe4383-42ab-4bb5-84d1-2033adb43497',
      };

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockReturnValue(mockLockedPayment),
      } as any);

      stateMachine = {
        getState: jest.fn().mockReturnValue(PaymentStatus.CAPTURED),
        capture: jest.fn(),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(stateMachine);

      const mockBankResponse: CaptureResponseDto = {
        amount: mockLockedPayment.amount,
        authorizationId: mockLockedPayment.authorizationId,
        captureId: 'cap_9dfb4de6-de66-4e87-902a-7dbed108b62e',
        capturedAt: new Date().toString(),
        currency: 'usd',
        status: PaymentStatus.CAPTURED,
      };

      mockBankPort.capture.mockResolvedValueOnce(mockBankResponse);

      await service.capture(mockLockedPayment.id, mockQueryRunner);

      expect(stateMachine.getState).toHaveBeenCalled();
      expect(mockBankPort.capture).toHaveBeenCalled();
      expect(mockQueryRunner.manager.getRepository).toHaveBeenCalled();

      expect(mockBankPort.capture).toHaveBeenCalledWith(
        {
          amount: mockLockedPayment.amount,
          authorizationId: mockLockedPayment.authorizationId,
        },
        'a3919f91-19b9-4bcd-95a4-e9276d956173',
      );

      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          state: PaymentStatus.CAPTURED,
        }),
      );
    });

    it('Failure Case: should throw error: PAYMENT NOT FOUND when payment reference is not existing', async () => {
      const paymentReference = 'non-existing-uuid';

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(
        service.capture(paymentReference, mockQueryRunner),
      ).rejects.toThrow(
        new HttpException('PAYMENT NOT FOUND', HttpStatus.NOT_FOUND),
      );
    });

    it('Failure Case: should throw error, reverse state to AUTHORIZED, save receipt when Bank returns 4xx error', async () => {
      const paymentReference = '5326526d-9aa7-4e14-a6d4-3284886da5df';

      const mockLockedPayment = {
        id: paymentReference,
        state: PaymentStatus.AUTHORIZED,
        orderId: 'ORD-123',
        amount: 250.5,
        authorizationId: 'auth_xxx',
        captureId: null,
        capturedAt: null,
      };

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockLockedPayment),
      } as any);

      const mockStateMachine = {
        capture: jest.fn(),
        getState: jest.fn().mockReturnValue(PaymentStatus.AUTHORIZED),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(mockStateMachine);

      const bankError = new HttpException(
        'Captured expired',
        HttpStatus.BAD_REQUEST,
      );

      mockBankPort.capture.mockRejectedValue(bankError);

      await service.capture(paymentReference, mockQueryRunner);

      expect(mockBankPort.capture).toHaveBeenCalledTimes(1);

      expect(mockStateMachine.capture).toHaveBeenCalledWith(
        PaymentEvent.CAPTURE_FAILURE,
      );
      expect(mockQueryRunner.manager.save).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: mockLockedPayment.orderId,
          state: PaymentStatus.AUTHORIZED,
        }),
      );
    });

    it('Failure Case: should throw error and NOT save when Bank returns 500 error', async () => {
      const paymentReference = '5326526d-9aa7-4e14-a6d4-3284886da5df';

      const mockLockedPayment = {
        id: paymentReference,
        state: PaymentStatus.AUTHORIZED,
        orderId: 'ORD-123',
        amount: 250.5,
        authorizationId: 'auth_xxx',
        captureId: null,
        capturedAt: null,
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue({
        getRepository: jest.fn().mockReturnThis(),
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockReturnValue(mockLockedPayment),
      } as any);

      const systemError = new HttpException(
        'Bank Down',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      mockBankPort.capture.mockRejectedValue(systemError);

      const mockStateMachine = {
        capture: jest.fn(),
        getState: jest.fn(),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(mockStateMachine);

      await expect(
        service.capture(paymentReference, mockQueryRunner),
      ).rejects.toThrow(HttpException);

      expect(mockStateMachine.capture).not.toHaveBeenCalled();
      expect(stateMachine.getState).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
    });
  });

  describe('void()', () => {
    it('Success Case: should successfully void payment and transition state', async () => {
      const paymentReference = '5326526d-9aa7-4e14-a6d4-3284886da5df';

      const mockLockedPayment = {
        id: paymentReference,
        state: PaymentStatus.CAPTURED,
        orderId: 'ORD-123',
        amount: 250.5,
        authorizationId: 'auth_44d8912c-6e54-4222-a85f-b81c41a4e927',
      };

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockReturnValue(mockLockedPayment),
      } as any);

      stateMachine = {
        void: jest.fn(),
        getState: jest.fn().mockReturnValue(PaymentStatus.VOIDED),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(stateMachine);

      const mockBankResponse: VoidResponseDto = {
        authorizationId: '',
        status: PaymentStatus.VOIDED,
        voidId: 'void_550e8400-e29b-41d4-a716-446655440002',
        voidedAt: Date(),
      };

      mockBankPort.void.mockResolvedValueOnce(mockBankResponse);

      await service.void(mockLockedPayment.id, mockQueryRunner);

      expect(stateMachine.getState).toHaveBeenCalled();
      expect(mockBankPort.void).toHaveBeenCalled();
      expect(mockQueryRunner.manager.getRepository).toHaveBeenCalled();

      expect(mockBankPort.void).toHaveBeenCalledWith(
        {
          authorizationId: mockLockedPayment.authorizationId,
        },
        'a3919f91-19b9-4bcd-95a4-e9276d956173',
      );

      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
    });

    it('Failure Case: should throw error: PAYMENT NOT FOUND when payment reference is not existing', async () => {
      const paymentReference = 'non-existing-uuid';

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(
        service.void(paymentReference, mockQueryRunner),
      ).rejects.toThrow(
        new HttpException('PAYMENT NOT FOUND', HttpStatus.NOT_FOUND),
      );

      expect(mockBankPort.void).not.toHaveBeenCalled();
    });

    it('Failure Case: reverse state to CAPTURED, save receipt when Bank returns 4xx error', async () => {
      const paymentReference = '5326526d-9aa7-4e14-a6d4-3284886da5df';

      const mockLockedPayment = {
        id: paymentReference,
        state: PaymentStatus.CAPTURED,
        orderId: 'ORD-123',
        amount: 250.5,
        authorizationId: 'auth_63651a73-955e-485a-8d29-0b388230963f',
        captureId: 'cap_d3f415a1-de58-4956-8321-9e698a8d18c1',
        capturedAt: Date(),
      };

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockLockedPayment),
      } as any);

      const bankError = new HttpException(
        'Captured expired',
        HttpStatus.BAD_REQUEST,
      );

      const mockStateMachine = {
        void: jest.fn(),
        getState: jest.fn().mockReturnValue(PaymentStatus.CAPTURED),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(mockStateMachine);

      mockBankPort.void.mockRejectedValue(bankError);

      await service.void(paymentReference, mockQueryRunner);

      expect(mockBankPort.void).toHaveBeenCalledTimes(1);

      expect(mockStateMachine.void).toHaveBeenCalledWith(
        PaymentEvent.VOID_FAILURE,
      );
      expect(mockQueryRunner.manager.save).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: mockLockedPayment.orderId,
          state: PaymentStatus.CAPTURED,
        }),
      );
    });

    it('Failure Case: should throw error and NOT save when Bank returns 500 error', async () => {
      const paymentReference = '5326526d-9aa7-4e14-a6d4-3284886da5df';

      const mockLockedPayment = {
        id: paymentReference,
        state: PaymentStatus.CAPTURED,
        orderId: 'ORD-123',
        amount: 250.5,
        authorizationId: 'auth_63651a73-955e-485a-8d29-0b388230963f',
        captureId: 'cap_d3f415a1-de58-4956-8321-9e698a8d18c1',
        capturedAt: Date(),
      };

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockLockedPayment),
      } as any);

      const bankError = new HttpException(
        'Captured expired',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      mockBankPort.void.mockRejectedValue(bankError);

      const mockStateMachine = {
        void: jest.fn(),
        getState: jest.fn(),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(mockStateMachine);

      await expect(
        service.void(paymentReference, mockQueryRunner),
      ).rejects.toThrow(HttpException);

      expect(stateMachine.getState).not.toHaveBeenCalled();
      expect(mockStateMachine.void).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
    });
  });

  describe('refund()', () => {
    it('Success Case: should successfully refund payment and transition state', async () => {
      const paymentReference = '5326526d-9aa7-4e14-a6d4-3284886da5df';

      const mockLockedPayment = {
        id: paymentReference,
        state: PaymentStatus.CAPTURED,
        orderId: 'ORD-123',
        amount: 250.5,
        authorizationId: 'auth_a0f68c76-fb7d-4e9f-98b8-f4c3512b6378',
        captureId: 'cap_20cd7174-3777-40fe-bac2-1d15a7847983',
      };

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockReturnValue(mockLockedPayment),
      } as any);

      stateMachine = {
        refund: jest.fn(),
        getState: jest.fn().mockReturnValue(PaymentStatus.REFUNDED),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(stateMachine);

      const mockBankResponse: RefundResponseDto = {
        amount: 250.5,
        captureId: 'cap_20cd7174-3777-40fe-bac2-1d15a7847983',
        currency: 'USD',
        refundId: 'refund_b7f9836d-5d44-44eb-8290-d054f397feb2',
        refundedAt: Date(),
        status: PaymentStatus.REFUNDED,
      };

      mockBankPort.refund.mockResolvedValueOnce(mockBankResponse);

      await service.refund(paymentReference, mockQueryRunner);

      expect(stateMachine.getState).toHaveBeenCalled();
      expect(mockBankPort.refund).toHaveBeenCalled();
      expect(mockQueryRunner.manager.getRepository).toHaveBeenCalled();

      expect(mockBankPort.refund).toHaveBeenCalledWith(
        {
          captureId: 'cap_20cd7174-3777-40fe-bac2-1d15a7847983',
          amount: mockBankResponse.amount,
        },
        'a3919f91-19b9-4bcd-95a4-e9276d956173',
      );

      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
    });

    it('Failure Case: should throw error: PAYMENT NOT FOUND when payment reference is not existing', async () => {
      const paymentReference = 'non-existing-uuid';

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(
        service.refund(paymentReference, mockQueryRunner),
      ).rejects.toThrow(
        new HttpException('PAYMENT NOT FOUND', HttpStatus.NOT_FOUND),
      );

      expect(mockBankPort.refund).not.toHaveBeenCalled();
    });

    it('Failure Case: reverse state to CAPTURED, save receipt when Bank returns 4xx error', async () => {
      const paymentReference = '5326526d-9aa7-4e14-a6d4-3284886da5df';

      const mockLockedPayment = {
        id: paymentReference,
        state: PaymentStatus.CAPTURED,
        orderId: 'ORD-123',
        amount: 250.5,
        authorizationId: 'auth_63651a73-955e-485a-8d29-0b388230963f',
        captureId: 'cap_d3f415a1-de58-4956-8321-9e698a8d18c1',
        capturedAt: Date(),
      };

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockLockedPayment),
      } as any);

      const bankError = new HttpException(
        'Captured expired',
        HttpStatus.BAD_REQUEST,
      );

      const mockStateMachine = {
        refund: jest.fn(),
        getState: jest.fn().mockReturnValue(PaymentStatus.CAPTURED),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(mockStateMachine);

      mockBankPort.refund.mockRejectedValue(bankError);

      await service.refund(paymentReference, mockQueryRunner);

      expect(mockBankPort.refund).toHaveBeenCalledTimes(1);

      expect(mockStateMachine.refund).toHaveBeenCalledWith(
        PaymentEvent.REFUND_FAILURE,
      );
      expect(mockQueryRunner.manager.save).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: mockLockedPayment.orderId,
          state: PaymentStatus.CAPTURED,
        }),
      );
    });

    it('Failure Case: should throw error, reverse state to CAPTURED, save receipt when Bank returns 500 error', async () => {
      const paymentReference = '5326526d-9aa7-4e14-a6d4-3284886da5df';

      const mockLockedPayment = {
        id: paymentReference,
        state: PaymentStatus.CAPTURED,
        orderId: 'ORD-123',
        amount: 250.5,
        authorizationId: 'auth_63651a73-955e-485a-8d29-0b388230963f',
        captureId: 'cap_d3f415a1-de58-4956-8321-9e698a8d18c1',
        capturedAt: Date(),
      };

      mockQueryRunner.manager.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockLockedPayment),
      } as any);

      const bankError = new HttpException(
        'Captured expired',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      mockBankPort.refund.mockRejectedValue(bankError);

      const mockStateMachine = {
        refund: jest.fn(),
        getState: jest.fn(),
      };

      jest
        .spyOn(
          require('@domain/statemachine/payment.statemachine'),
          'createPaymentStateMachine',
        )
        .mockReturnValue(mockStateMachine);

      await expect(
        service.refund(paymentReference, mockQueryRunner),
      ).rejects.toThrow(HttpException);

      expect(stateMachine.getState).not.toHaveBeenCalled();
      expect(mockStateMachine.refund).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
    });
  });
});
