import { Test, TestingModule } from '@nestjs/testing';
import { CaptureService } from './capture.service';
import { MockbankHttpService } from '../mockbank-http.service';
import { AxiosError, AxiosResponse } from 'axios';
import { of } from 'rxjs';
import { HttpException } from '@nestjs/common';
import {
  CreateCapturePaymentRequestDto,
  CreateCapturePaymentResponseDto,
} from 'src/dtos/mockbank/capture-payment.dto';

describe('CaptureService', () => {
  let service: CaptureService;
  let httpService: MockbankHttpService;

  const mockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaptureService,
        {
          provide: MockbankHttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<CaptureService>(CaptureService);
    httpService = module.get<MockbankHttpService>(MockbankHttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('captures', () => {
    const createDto: CreateCapturePaymentRequestDto = {
      amount: 5000,
      authorizationId: 'auth_550e8400-e29b-41d4-a716-446655440000',
    };

    const mockSuccessResponse: AxiosResponse<CreateCapturePaymentResponseDto> =
      {
        data: {
          amount: 100,
          authorizationId: `auth_550e8400-e29b-41d4-a716-446655440000`,
          captureId: `cap_550e8400-e29b-41d4-a716-446655440000`,
          capturedAt: new Date(),
          currency: 'USD',
          status: 'captured',
        },
        status: 201,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': 'key-abc-123',
        },
        config: {} as any,
      };

    it('should create capture with idempotency key', (done) => {
      mockHttpService.post.mockReturnValueOnce(of(mockSuccessResponse));

      service.captures(createDto, 'key-abc-123').subscribe({
        next: (res) => {
          expect(res).toEqual(mockSuccessResponse);
          expect(mockHttpService.post).toHaveBeenCalledWith(
            '/api/v1/captures',
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

    it('should throw error if idempotency key is missing', (done) => {
      mockHttpService.post.mockReturnValueOnce(of(mockSuccessResponse));

      service.captures(createDto, '').subscribe({
        next: (res) => {
          expect(res).toEqual(mockSuccessResponse);
          expect(mockHttpService.post).toHaveBeenCalledWith(
            '/api/v1/captures',
            createDto,
            expect.objectContaining({
              headers: expect.objectContaining({
                'Idempotency-Key': '',
                'Content-Type': 'application/json',
                Accept: 'application/json',
              }),
            }),
          );

          done();
        },

        error: (error) => {
          expect(error).toBeDefined();
          done();
        },
      });
    });

    it('should throw error if card is invalid', (done) => {
      const failedDataDto = {
        amount: -1213,
        authorizationId: 'auth_550e8400-e29b-41d4-a716-446655440000',
      };

      const mockErrorResponse = new AxiosError(
        'Bad Request',
        '400',
        undefined,
        undefined,
        {
          status: 402,
          data: 'Invalid Card: Available balance is less than requested amount',
        } as any,
      );

      mockHttpService.post.mockReturnValueOnce(of(mockErrorResponse));

      service.captures(failedDataDto, 'key-abc-123').subscribe({
        next: (res) => {
          expect(mockHttpService.post).toHaveBeenCalledWith(
            '/api/v1/captures',
            failedDataDto,
            expect.objectContaining({
              headers: expect.objectContaining({
                'Idempotency-Key': 'key-abc-123',
                'Content-Type': 'application/json',
                Accept: 'application/json',
              }),
            }),
          );
          expect(res).toEqual(mockErrorResponse);
          done();
        },
      });
    });

    it('should throw error if card is invalid', (done) => {
      const mockErrorResponse = new AxiosError(
        'Internal Server Error',
        '500',
        undefined,
        undefined,
        {
          status: 500,
          data: 'Internal Server Error',
        } as any,
      );

      mockHttpService.post.mockReturnValueOnce(of(mockErrorResponse));

      service.captures(createDto, 'key-abc-123').subscribe({
        next: (res) => {
          expect(mockHttpService.post).toHaveBeenCalledWith(
            '/api/v1/captures',
            createDto,
            expect.objectContaining({
              headers: expect.objectContaining({
                'Idempotency-Key': 'key-abc-123',
                'Content-Type': 'application/json',
                Accept: 'application/json',
              }),
            }),
          );
          expect(res).toEqual(mockErrorResponse);

          done();
        },

        error: (error) => {
          expect(error).toBeDefined();
          done();
        },
      });
    });
  });
});
