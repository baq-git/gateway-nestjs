import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { firstValueFrom, of, throwError } from 'rxjs';
import { MockBankHttpService } from '../mockbank.http.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { AxiosError } from 'axios';

describe('MockbankHttpService', () => {
  let service: MockBankHttpService;
  let httpService: DeepMocked<HttpService>;

  beforeEach(async () => {
    httpService = createMock<HttpService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockBankHttpService,
        {
          provide: HttpService,
          useValue: httpService,
        },
      ],
    }).compile();

    service = module.get<MockBankHttpService>(MockBankHttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST', () => {
    it('should convert camelCase request to snake_case and camelCase response', async () => {
      const requestData = {
        userId: 123,
        firstName: 'John',
        createdAt: '2025-01-01',
      };

      const mockResponseData = {
        account_id: 123,
        balance: 100,
        created_at: '2025-01-01',
      };

      const expectedResponse = {
        accountId: 123,
        balance: 100,
        createdAt: '2025-01-01',
      };

      httpService.post.mockReturnValue(
        of({ data: mockResponseData } as AxiosResponse),
      );

      const result = await firstValueFrom(service.post('/users', requestData));

      expect(result).toEqual(expectedResponse);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:8787/users',
        {
          user_id: 123,
          first_name: 'John',
          created_at: '2025-01-01',
        },
        undefined,
      );
    });

    it('should add Idempotency-Key in headers when provided', async () => {
      const idempotencyKey = 'test-idempotency-123';

      httpService.post.mockReturnValue(of({ data: {} } as AxiosResponse));

      await firstValueFrom(
        service.post(
          '/authorizations',
          { amount: 100000 },
          {
            headers: { 'Idempotency-Key': idempotencyKey },
          },
        ),
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': idempotencyKey,
          }),
        }),
      );
    });
  });

  describe('GET', () => {
    it('should convert snake_case response to camelCase', async () => {
      const mockResponseData = {
        user_id: 456,
        full_name: 'Alice Smith',
        created_at: '2025-04-09',
      };

      httpService.get.mockReturnValue(
        of({ data: mockResponseData } as AxiosResponse),
      );

      const result = await firstValueFrom(service.get('/users/456'));

      expect(result).toEqual({
        userId: 456,
        fullName: 'Alice Smith',
        createdAt: '2025-04-09',
      });

      expect(httpService.get).toHaveBeenCalledWith(
        'http://localhost:8787/users/456',
        undefined,
      );
    });
  });

  describe('Error Handling', () => {
    it('should convert error response from snake_case to camelCase', async () => {
      const errorResponseData = {
        error_code: 'insufficient_funds',
        error_message: 'Not enough balance',
      };

      const axiosError = new AxiosError(
        'Payment Required',
        '402',
        undefined,
        undefined,
        {
          data: errorResponseData,
          status: 402,
          statusText: 'Payment Required',
          headers: {},
          config: {} as any,
        } as any,
      );

      httpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        firstValueFrom(service.post('/payments', { amount: 100 })),
      ).rejects.toThrow(AxiosError);

      expect(axiosError.response?.data).toEqual({
        errorCode: 'insufficient_funds',
        errorMessage: 'Not enough balance',
      });
    });
  });
});
