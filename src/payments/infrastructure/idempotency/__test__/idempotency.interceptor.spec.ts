import { IdempotencyService } from '../idempotency.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import {
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IdempotencyInterceptor } from '../idempotency.interceptor';
import { DataSource, QueryRunner } from 'typeorm';
import { lastValueFrom, of, throwError } from 'rxjs';
import { PaymentStatus } from '@domain/constants';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let idempotencyService: DeepMocked<IdempotencyService>;
  let dataSource: DeepMocked<DataSource>;
  let mockExecutionContext: DeepMocked<ExecutionContext>;
  let mockCallHandler: DeepMocked<CallHandler>;
  let mockQueryRunner: DeepMocked<QueryRunner>;

  const validIdempotencyKey = '2624503c-3ac8-470f-a013-aa7669a3c099';

  const createRequestMock = (key?: string | undefined) => ({
    get: jest.fn().mockReturnValue(key),
    path: 'test/request-path',
    method: 'POST',
    headers: {},
    body: { orderId: 'ORD-123', amount: 100000 },
  });

  beforeEach(async () => {
    idempotencyService = createMock<IdempotencyService>();
    dataSource = createMock<DataSource>();
    mockQueryRunner = createMock<QueryRunner>({
      isTransactionActive: true,
      isReleased: false,
    });

    dataSource.createQueryRunner.mockReturnValue(mockQueryRunner);

    mockCallHandler = createMock<CallHandler>({
      handle: jest.fn(),
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        { provide: IdempotencyService, useValue: idempotencyService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    interceptor = moduleRef.get<IdempotencyInterceptor>(IdempotencyInterceptor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Header Validation', () => {
    it('should throw BadRequest if idempotency-key header is missing', async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock(undefined),
        }),
      });

      try {
        await interceptor.intercept(mockExecutionContext, mockCallHandler);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.status).toBe(HttpStatus.BAD_REQUEST);
        expect(error.response).toContain(
          "Header 'idempotency-key' is required",
        );
      }
    });

    it('should throw BadRequest if idempotency-key is not a valid UUID', async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock('123'),
        }),
      });

      try {
        await interceptor.intercept(mockExecutionContext, mockCallHandler);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.status).toBe(HttpStatus.BAD_REQUEST);
        expect(error.response).toContain(
          "Header 'idempotency-key' is not a valid UUID",
        );
      }
    });
  });

  describe('EXISTING RECORD BEHAVIOR', () => {
    it('should throw UNPROCESSABLE ENTITY if different payload hash', async () => {
      const idempotencyKey = validIdempotencyKey;

      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => ({
            get: jest.fn().mockReturnValue(idempotencyKey),
            method: 'POST',
            body: { orderId: 'ORD-999', amount: 500000 }, // payload khác với lần trước
            headers: {},
          }),
        }),
      });

      const existingRecord = {
        operation: 'success',
        responseBody: {
          paymentReference: 'pay_12345',
          status: 'AUTHORIZED',
        },
      };

      idempotencyService.findByKey.mockResolvedValue(existingRecord as any);

      jest
        .spyOn(require('@common/utils/requestHash'), 'compareHash')
        .mockImplementation(() => {
          throw new HttpException(
            'Bad Request: Idempotency-Key reused with different payload',
            HttpStatus.UNPROCESSABLE_ENTITY,
            {
              cause: {
                message:
                  'Payload mismatch - request body/method/path has changed',
              },
            },
          );
        });

      try {
        await interceptor.intercept(mockExecutionContext, mockCallHandler);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(error.message).toContain('different payload');
      }
    });

    it('should replay response when key already succeeded', async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () =>
            createRequestMock('0805f00a-84ec-4a9e-b1c1-a5f5da11db0e'),
        }),
      });

      const mockSuccessResponse = {
        paymentReference: 'pay_12345',
        status: 'AUTHORIZED',
      };

      const existing = {
        operation: 'success',
        responseBody: mockSuccessResponse,
      };

      idempotencyService.findByKey.mockResolvedValue(existing as any);

      jest
        .spyOn(require('@common/utils/requestHash'), 'compareHash')
        .mockImplementation();

      const result = await lastValueFrom(
        await interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual(mockSuccessResponse);
      expect(idempotencyService.createOrLock).not.toHaveBeenCalled();
      expect(mockCallHandler.handle).not.toHaveBeenCalled();
    });

    it('should throw Conflict when key is still processing', async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () =>
            createRequestMock('0805f00a-84ec-4a9e-b1c1-a5f5da11db0e'),
        }),
      });

      const mockSuccessResponse = {
        paymentId: 'pay_123456',
        status: PaymentStatus.Pending,
      };

      const existing = {
        operation: 'processing',
        responseBody: mockSuccessResponse,
      };

      idempotencyService.findByKey.mockResolvedValue(existing as any);

      try {
        await interceptor.intercept(mockExecutionContext, mockCallHandler);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
      }
    });

    it('should allow retry when previous operation failed', async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () =>
            createRequestMock('0805f00a-84ec-4a9e-b1c1-a5f5da11db0e'),
        }),
      });

      const mockSuccessResponse = {
        paymentId: 'pay_123456',
        status: PaymentStatus.Pending,
      };

      const existing = {
        operation: 'failure',
        responseBody: mockSuccessResponse,
      };

      idempotencyService.findByKey.mockResolvedValue(existing as any);

      const result = await lastValueFrom(
        await interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toBe('retry');
    });
  });

  describe('ERROR HANDLING', () => {
    it('should save error and rollback transaction when request fails', async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock(validIdempotencyKey),
        }),
      });

      const mockError = new HttpException(
        'Insufficient funds',
        HttpStatus.BAD_REQUEST,
      );

      idempotencyService.findByKey.mockResolvedValue(null);

      mockCallHandler.handle.mockReturnValue(throwError(() => mockError));

      await expect(
        lastValueFrom(
          await interceptor.intercept(mockExecutionContext, mockCallHandler),
        ),
      ).rejects.toThrow(HttpException);

      expect(idempotencyService.saveError).toHaveBeenCalled();
      expect(idempotencyService.saveError).toHaveBeenCalledWith(
        validIdempotencyKey,
        mockError,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should still throw original error even if saveError fails', async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock(validIdempotencyKey),
        }),
      });

      const mockError = new HttpException(
        'Payment failed',
        HttpStatus.BAD_REQUEST,
      );

      idempotencyService.findByKey.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(throwError(() => mockError));
      idempotencyService.saveError.mockRejectedValue(
        new Error('Database save error'),
      );

      const observable = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await expect(lastValueFrom(await observable)).rejects.toThrow(mockError);

      expect(idempotencyService.saveError).toHaveBeenCalled();
    });
  });

  describe('TRANSACTION & RESOURCE MANAGEMENT', () => {
    it('should start transaction, commit and release queryRunner on successful request', async () => {
      const mockSuccessResponse = {
        paymentReference: 'pay_12345',
        status: 'AUTHORIZED',
      };

      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock(validIdempotencyKey),
        }),
      });

      idempotencyService.findByKey.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of(mockSuccessResponse));

      await lastValueFrom(
        await interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(idempotencyService.createOrLock).toHaveBeenCalledWith(
        validIdempotencyKey,
      );
      expect(idempotencyService.saveResponse).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction when request fails', async () => {
      const mockError = new HttpException(
        'Payment failed',
        HttpStatus.BAD_REQUEST,
      );

      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock(validIdempotencyKey),
        }),
      });

      idempotencyService.findByKey.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(throwError(() => mockError));

      await expect(
        lastValueFrom(
          await interceptor.intercept(mockExecutionContext, mockCallHandler),
        ),
      ).rejects.toThrow(mockError);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should NOT start transaction when replaying a successful idempotency key', async () => {
      const mockSuccessResponse = {
        paymentReference: 'pay_12345',
        status: 'AUTHORIZED',
      };

      const existing = {
        operation: 'success',
        responseBody: mockSuccessResponse,
      };

      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock(validIdempotencyKey),
        }),
      });

      idempotencyService.findByKey.mockResolvedValue(existing as any);

      jest
        .spyOn(require('@common/utils/requestHash'), 'compareHash')
        .mockImplementation();

      await lastValueFrom(
        await interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('should NOT create queryRunner when header validation fails (missing key)', async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock('123'),
        }),
      });

      try {
        await interceptor.intercept(mockExecutionContext, mockCallHandler);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
      }
    });

    it('should rollback and release queryRunner when createOrLock fails', async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock(validIdempotencyKey),
        }),
      });

      idempotencyService.findByKey.mockResolvedValue(null);
      idempotencyService.createOrLock.mockRejectedValue(
        new Error('Lock failed'),
      );

      try {
        await interceptor.intercept(mockExecutionContext, mockCallHandler);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.release).toHaveBeenCalled();
      }
    });

    it('should release queryRunner even if saveError fails in catchError', async () => {
      const mockError = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock(validIdempotencyKey),
        }),
      });

      idempotencyService.findByKey.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(throwError(() => mockError));
      idempotencyService.saveError.mockRejectedValue(
        new Error('Save error failed'),
      );

      await expect(
        lastValueFrom(
          await interceptor.intercept(mockExecutionContext, mockCallHandler),
        ),
      ).rejects.toThrow(mockError);

      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('CONCURRENT SIMULATION', () => {
    it('should handle basic concurrent request simulation', async () => {
      const mockSuccessResponse = {
        paymentReference: 'pay_12345',
        status: 'AUTHORIZED',
      };

      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => createRequestMock(validIdempotencyKey),
        }),
      });

      idempotencyService.findByKey.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of(mockSuccessResponse));

      const promise1 = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      const promise2 = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      const results = await Promise.allSettled([
        lastValueFrom(await promise1),
        lastValueFrom(await promise2),
      ]);

      const successOrConflict = results.some((r) => {
        if (r.status === 'rejected') return false;
        const value = r.value;
        return (
          !(value instanceof HttpException) ||
          value.getStatus() === HttpStatus.CONFLICT
        );
      });

      expect(successOrConflict).toBe(true);

      // Ít nhất 1 lần createOrLock phải được gọi
      expect(idempotencyService.createOrLock).toHaveBeenCalled();
    });
  });
});
