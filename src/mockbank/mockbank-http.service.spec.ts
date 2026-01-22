import { Test, TestingModule } from '@nestjs/testing';
import { MockbankHttpService } from './mockbank-http.service';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { of } from 'rxjs';

describe('MockbankHttpService', () => {
  let service: MockbankHttpService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockbankHttpService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<MockbankHttpService>(MockbankHttpService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('GET', () => {
    it('should convert snake_case response to camelCase', (done) => {
      const responseData = {
        user_id: 123,
        first_name: 'John',
        created_at: '2025-01-01',
      };

      const expectedCamelCase = {
        userId: 123,
        firstName: 'John',
        createdAt: '2025-01-01',
      };

      const axiosResponse: AxiosResponse = {
        data: responseData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockHttpService.get.mockReturnValue(of(axiosResponse));

      service.get('/users/123').subscribe((result) => {
        expect(result).toEqual(expectedCamelCase);
        expect(httpService.get).toHaveBeenCalledWith(
          'http://localhost:8787/users/123',
          undefined,
        );
        done();
      });
    });
  });

  describe('POST', () => {
    it('should convert camelCase request to snake_case', (done) => {
      const requestData = {
        userId: 123,
        firstName: 'John',
        createdAt: '2025-01-01',
      };

      const expectedSnakeCaseRequest = {
        user_id: 123,
        first_name: 'John',
        created_at: '2025-01-01',
      };

      const responseData = {
        account_id: 123,
        balance: 100,
      };

      const expectedResponse = {
        accountId: 123,
        balance: 100,
      };

      const axiosResponse: AxiosResponse = {
        data: responseData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockHttpService.post.mockReturnValue(of(axiosResponse));

      service.post('/users', requestData).subscribe((result) => {
        expect(result).toEqual(expectedResponse);
        expect(httpService.post).toHaveBeenCalledWith(
          'http://localhost:8787/users',
          expectedSnakeCaseRequest,
          undefined,
        );
        done();
      });
    });
  });
});
