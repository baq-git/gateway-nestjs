import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { MockBankAdapter } from '../mockbank.adapter';
import { TestingModule, Test } from '@nestjs/testing';
import { MockBankHttpService } from '../mockbank.http.service';
import { of, throwError } from 'rxjs';
import { HttpException } from '@nestjs/common';
import { AxiosError } from 'axios';

describe('MockbankAdapter', () => {
  let adapter: MockBankAdapter;
  let mockBankHttpService: DeepMocked<MockBankHttpService>;

  const validAuthorizeData = {
    amount: 100,
    cardNumber: '4111111111111111',
    cvv: '123',
    expiryMonth: 12,
    expiryYear: 2027,
  };

  const validIdempotencyKey = '7485dd16-d491-4049-bdd6-ff8c7ad18638';

  const validCaptureData = {
    authorizationId: 'auth_550e8400-e29b-41d4-a716-446655440000',
    amount: 999900,
  };

  beforeEach(async () => {
    mockBankHttpService = createMock<MockBankHttpService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockBankAdapter,
        {
          provide: MockBankHttpService,
          useValue: mockBankHttpService,
        },
      ],
    }).compile();

    adapter = module.get<MockBankAdapter>(MockBankAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authorize', () => {
    it('should call http service with correct payload and idempotency key', async () => {
      const mockResponse = {
        authorizationId: 'auth_123456',
        status: 'approved',
        amount: 999900,
        currency: 'USD',
        expiresAt: '2026-04-14T10:00:00Z',
      };

      mockBankHttpService.post.mockReturnValue(of(mockResponse));

      const result = await adapter.authorize(
        validAuthorizeData,
        validIdempotencyKey,
      );

      expect(result).toEqual(mockResponse);

      expect(mockBankHttpService.post).toHaveBeenCalledWith(
        '/api/v1/authorizations',
        validAuthorizeData,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': validIdempotencyKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          }),
        }),
      );
    });

    it('should throw HttpException when bank returns error', async () => {
      const axiosError = new AxiosError(
        'Payment Required',
        '402',
        undefined,
        undefined,
        {
          status: 402,
          data: {
            error: 'insufficient_funds',
            message: 'Available balance is less than requested amount',
          },
          statusText: 'Payment Required',
          headers: {},
          config: {} as any,
        } as any,
      );

      mockBankHttpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        adapter.authorize(validAuthorizeData, validIdempotencyKey),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('capture', () => {
    it('should call capture endpoint with correct data', async () => {
      const mockResponse = { captureId: 'cap_123', status: 'captured' };
      mockBankHttpService.post.mockReturnValue(of(mockResponse));

      const result = await adapter.capture(
        validCaptureData,
        validIdempotencyKey,
      );

      expect(result).toEqual(mockResponse);
      expect(mockBankHttpService.post).toHaveBeenCalledWith(
        '/api/v1/captures',
        validCaptureData,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': validIdempotencyKey,
          }),
        }),
      );
    });
  });

  describe('void', () => {
    it('should call void endpoint', async () => {
      const voidData = { authorizationId: 'auth_xxx' };
      mockBankHttpService.post.mockReturnValue(of({ status: 'voided' }));

      await adapter.void(voidData, validIdempotencyKey);

      expect(mockBankHttpService.post).toHaveBeenCalledWith(
        '/api/v1/voids',
        voidData,
        expect.any(Object),
      );
    });
  });

  describe('refund', () => {
    it('should call refund endpoint', async () => {
      const refundData = { captureId: 'cap_123', amount: 500000 };
      mockBankHttpService.post.mockReturnValue(
        of({ refundId: 'ref_456', status: 'refunded' }),
      );

      await adapter.refund(refundData, validIdempotencyKey);

      expect(mockBankHttpService.post).toHaveBeenCalledWith(
        '/api/v1/refunds',
        refundData,
        expect.any(Object),
      );
    });
  });

  describe('Error Case', () => {
    describe('authorize', () => {
      it('should throw HttpException when bank returns insufficient_funds (402)', async () => {
        const insufficient_funds = {
          amount: 0,
          cardNumber: '4111111111111111',
          cvv: '123',
          expiryMonth: 12,
          expiryYear: 2027,
        };

        const axiosError = new AxiosError(
          'Payment Required',
          '402',
          undefined,
          undefined,
          {
            status: 402,
            data: {
              error: 'insufficient_funds',
              message: 'Available balance is less than requested amount',
            },
            statusText: 'Payment Required',
            headers: {},
            config: {} as any,
          } as any,
        );

        mockBankHttpService.post.mockReturnValue(throwError(() => axiosError));

        await expect(
          adapter.authorize(validAuthorizeData, validIdempotencyKey),
        ).rejects.toThrow(HttpException);

        try {
          await adapter.authorize(validAuthorizeData, validIdempotencyKey);
        } catch (error) {
          expect(error).toBeInstanceOf(HttpException);
          expect(error.getStatus()).toBe(402);
          expect(error.message).toContain(
            'Available balance is less than requested amount',
          );
        }
      });

      it('should throw HttpException when card is declined', async () => {
        const axiosError = new AxiosError(
          'Card Declined',
          '400',
          undefined,
          undefined,
          {
            status: 400,
            data: {
              error: 'card_declined',
              message: 'Your card was declined',
            },
            statusText: 'Bad Request',
            headers: {},
            config: {} as any,
          } as any,
        );

        mockBankHttpService.post.mockReturnValue(throwError(() => axiosError));

        await expect(
          adapter.authorize(validAuthorizeData, validIdempotencyKey),
        ).rejects.toThrow(HttpException);
      });

      it('should throw HttpException when authorization expired', async () => {
        const axiosError = new AxiosError(
          'Authorization Expired',
          '410',
          undefined,
          undefined,
          {
            status: 410,
            data: {
              error: 'authorization_expired',
              message: 'Authorization has expired',
            },
            statusText: 'Gone',
            headers: {},
            config: {} as any,
          } as any,
        );

        mockBankHttpService.post.mockReturnValue(throwError(() => axiosError));

        await expect(
          adapter.authorize(
            { ...validAuthorizeData, amount: 100 },
            validIdempotencyKey,
          ),
        ).rejects.toThrow(HttpException);
      });
    });

    describe('capture', () => {
      const validCaptureData = {
        authorizationId: 'auth_550e8400-e29b-41d4-a716-446655440000',
        amount: 999900,
      };

      it('should throw HttpException when capture fails because already captured', async () => {
        const axiosError = new AxiosError(
          'Already Captured',
          '409',
          undefined,
          undefined,
          {
            status: 409,
            data: {
              error: 'already_captured',
              message: 'This authorization has already been captured',
            },
            statusText: 'Conflict',
            headers: {},
            config: {} as any,
          } as any,
        );

        mockBankHttpService.post.mockReturnValue(throwError(() => axiosError));

        await expect(
          adapter.capture(validCaptureData, validIdempotencyKey),
        ).rejects.toThrow(HttpException);
      });

      it('should throw HttpException when authorization not found', async () => {
        const axiosError = new AxiosError(
          'Not Found',
          '404',
          undefined,
          undefined,
          {
            status: 404,
            data: {
              error: 'authorization_not_found',
              message: 'Authorization does not exist',
            },
            statusText: 'Not Found',
            headers: {},
            config: {} as any,
          } as any,
        );

        mockBankHttpService.post.mockReturnValue(throwError(() => axiosError));

        await expect(
          adapter.capture(validCaptureData, validIdempotencyKey),
        ).rejects.toThrow(HttpException);
      });
    });

    describe('void & refund', () => {
      it('should throw HttpException on void when payment already captured', async () => {
        const voidData = { authorizationId: 'auth_xxx' };
        const axiosError = new AxiosError(
          'Cannot void captured payment',
          '400',
          undefined,
          undefined,
          {
            status: 400,
            data: {
              error: 'cannot_void_captured',
              message: 'Cannot void a captured payment',
            },
            statusText: 'Bad Request',
            headers: {},
            config: {} as any,
          } as any,
        );

        mockBankHttpService.post.mockReturnValue(throwError(() => axiosError));

        await expect(
          adapter.void(voidData, validIdempotencyKey),
        ).rejects.toThrow(HttpException);
      });

      it('should throw HttpException on refund when amount exceeds captured amount', async () => {
        const refundData = { captureId: 'cap_123', amount: 2000000 };
        const axiosError = new AxiosError(
          'Refund amount too large',
          '400',
          undefined,
          undefined,
          {
            status: 400,
            data: {
              error: 'refund_amount_exceeded',
              message: 'Refund amount exceeds captured amount',
            },
            statusText: 'Bad Request',
            headers: {},
            config: {} as any,
          } as any,
        );

        mockBankHttpService.post.mockReturnValue(throwError(() => axiosError));

        await expect(
          adapter.refund(refundData, validIdempotencyKey),
        ).rejects.toThrow(HttpException);
      });
    });
  });
});
