import { Test, TestingModule } from '@nestjs/testing';
import { MockbankService } from './mockbank.service';
import { MockbankHttpService } from './mockbank-http.service';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import {
  CreateAuthorizePaymentRequestDto,
  CreateAuthorizePaymentResponseDto,
} from '../payment-receipt/dtos/authorize-payment.dto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IdempotencyKey } from '../payment-receipt/entity/idempotency-keys.entity';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';

describe('MockbankService', () => {
  let service: MockbankService;
  let httpService: MockbankHttpService;

  const mockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const mockIdempotencyRepository = {
    create: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockbankService,
        IdempotencyLayerInterceptor,
        {
          provide: MockbankHttpService,
          useValue: mockHttpService,
        },
        {
          provide: getRepositoryToken(IdempotencyKey),
          useValue: mockIdempotencyRepository,
        },
      ],
    }).compile();

    service = module.get<MockbankService>(MockbankService);
    httpService = module.get<MockbankHttpService>(MockbankHttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(httpService).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return the health status', (done) => {
      const mockResponse: AxiosResponse<{ status: string }> = {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as any },
        data: { status: 'healthy' },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      service.getHealth().subscribe({
        next: (res) => {
          expect(res).toEqual(mockResponse);
          expect(mockHttpService.get).toHaveBeenCalledWith('/api/v1/health');
          done();
        },
        error: done.fail,
      });
    });
  });

  describe('authorizations', () => {
    const createDto: CreateAuthorizePaymentRequestDto = {
      amount: 5000,
      cardNumber: '4111111111111111',
      cvv: '123',
      expiryMonth: 12,
      expiryYear: 2027,
    };

    const mockSuccessResponse: AxiosResponse<CreateAuthorizePaymentResponseDto> =
      {
        data: {
          amount: 100,
          authorizationId: `auth_550e8400-e29b-41d4-a716-446655440000`,
          createdAt: new Date(),
          currency: 'USD',
          expiresAt: new Date(),
          status: 'approved',
        },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: { headers: {} as any },
      };

    it('should create authorization with idempotency key', (done) => {
      mockHttpService.post.mockReturnValueOnce(of(mockSuccessResponse));

      service.authorizations(createDto, 'key-abc-123').subscribe({
        next: (res) => {
          expect(res).toEqual(mockSuccessResponse);
          expect(mockHttpService.post).toHaveBeenCalledWith(
            '/api/v1/authorizations',
            createDto,
            expect.objectContaining({
              headers: expect.objectContaining({
                'Idempotency-Key': 'key-abc-123',
                'Content-Type': 'application/json',
                Accept: 'application/json',
              }),
            }),
          );

          done();
        },

        error: () => done(),
      });
    });

    it('should throw BAD_REQUEST when idempotencyKey is missing', (done) => {
      const mockMissingIdempotencyKeyResponse = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: { headers: {} as any },
        data: {
          message:
            'Header parameter Idempotency-Key is required, but not found ',
        },
      };

      mockHttpService.post.mockReturnValue(
        of(mockMissingIdempotencyKeyResponse),
      );

      const result = service.authorizations(createDto, '');

      result.subscribe({
        next: () => done(),
        error: (err) => {
          expect(err).toBeInstanceOf(HttpException);
          expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
          expect(err.message).toContain('Missing Idempotency-Key header');
          done();
        },
      });
    });

    it('should map 400 → Invalid Card: Mockbank authorization request is invalid or validation failed', (done) => {
      const axiosError = new AxiosError(
        'Bad Request',
        '400',
        undefined,
        undefined,
        {
          status: 400,
          data: 'Invalid Card: Mockbank authorization request is invalid or validation failed.',
        } as any,
      );

      mockHttpService.post.mockReturnValueOnce(throwError(() => axiosError));

      service.authorizations(createDto, 'key-xyz').subscribe({
        next: () => done(),
        error: (err) => {
          expect(err).toBeInstanceOf(HttpException);
          expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
          expect(err.message).toContain(
            'Invalid Card: Mockbank authorization request is invalid or validation failed',
          );
          done();
        },
      });
    });

    it('should map 402 → Invalid Card: Available balance is less than requested amount', () => {
      const axiosError = new AxiosError(
        'Payment Required',
        '402',
        undefined,
        undefined,
        {
          status: 402,
          data: 'Invalid Card: Available balance is less than requested amount',
        } as any,
      );

      mockHttpService.post.mockReturnValueOnce(throwError(() => axiosError));

      service.authorizations(createDto, 'key-xyz').subscribe({
        error: (err) => {
          expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
          expect(err.message).toContain(
            'Invalid Card: Available balance is less than requested amount',
          );
        },
      });
    });

    it('should map 500 → Internal Server Error', () => {
      const axiosError = new AxiosError(
        'Internal Server Error',
        '500',
        undefined,
        undefined,
        { status: 500, data: 'Internal Server Error' } as any,
      );

      mockHttpService.post.mockReturnValueOnce(throwError(() => axiosError));

      const result = service.authorizations(createDto, 'key-xyz');

      result.subscribe({
        error: (err) => {
          expect(err.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
          expect(err.message).toContain('Internal Server Error');
        },
      });
    });
  });
});
