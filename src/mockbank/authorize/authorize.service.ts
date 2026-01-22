import { catchError, map, Observable } from 'rxjs';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AxiosError, AxiosResponse } from 'axios';
import { MockbankHttpService } from '../mockbank-http.service';
import {
  GetAuthorizePaymentResponseDto,
  CreateAuthorizePaymentRequestDto,
  CreateAuthorizePaymentResponseDto,
} from 'src/dtos/mockbank/authorize-payment.dto';

@Injectable()
export class AuthorizeService {
  constructor(private httpService: MockbankHttpService) {}

  getHealth(): Observable<AxiosResponse<{ status: string }>> {
    return this.httpService.get('/api/v1/health');
  }

  getAuthorization(
    authorizationId: string,
  ): Observable<AxiosResponse<GetAuthorizePaymentResponseDto>> {
    const authId = `auth_${authorizationId}`;
    return this.httpService
      .get(`/api/v1/authorizations/${authId}`, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      })
      .pipe(
        catchError((error: AxiosError) => {
          throw new HttpException(
            error.message,
            error.response?.status || 500,
            {
              cause: error,
            },
          );
        }),
      );
  }

  authorizations(
    data: CreateAuthorizePaymentRequestDto,
    idempotencyKey: string,
  ): Observable<AxiosResponse<CreateAuthorizePaymentResponseDto>> {
    return this.httpService
      .post(`/api/v1/authorizations`, data, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      })
      .pipe(
        map((response) => {
          const axiosResponse: AxiosResponse<CreateAuthorizePaymentResponseDto> =
            {
              data: response,
              status: 201,
              statusText: 'OK',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Idempotency-Key': idempotencyKey,
              },
              config: {
                url: '/api/v1/authorizations',
                method: 'post',
              } as any,
            };
          return axiosResponse;
        }),
        catchError((error: AxiosError) => {
          if (!idempotencyKey) {
            if (error.response?.data) {
              throw new HttpException(
                `Bad Request: ${error.response?.data}`,
                HttpStatus.BAD_REQUEST,
                {
                  cause: error,
                },
              );
            }

            throw new HttpException(
              'Missing Idempotency-Key header',
              HttpStatus.BAD_REQUEST,
              {
                cause: error,
              },
            );
          }

          if (error.response?.status === HttpStatus.BAD_REQUEST) {
            if (error.response?.data) {
              throw new HttpException(
                `Invalid Card: ${error.response?.data}`,
                HttpStatus.BAD_REQUEST,
                {
                  cause: error,
                },
              );
            }

            throw new HttpException(
              'Invalid Card: Mockbank authorization request is invalid or validation failed.',
              HttpStatus.BAD_REQUEST,
              {
                cause: error,
              },
            );
          }

          if (error.response?.status === HttpStatus.PAYMENT_REQUIRED) {
            if (error.response?.data) {
              throw new HttpException(
                `Invalid Card: ${error.response?.data}`,
                HttpStatus.PAYMENT_REQUIRED,
                {
                  cause: error,
                },
              );
            }

            throw new HttpException(
              'Invalid Card: Available balance is less than requested amount',
              HttpStatus.PAYMENT_REQUIRED,
              {
                cause: error,
              },
            );
          }

          if (error.response?.status === HttpStatus.INTERNAL_SERVER_ERROR) {
            if (error.response?.data) {
              throw new HttpException(
                `Internal Server Error: ${error.response?.data}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
                {
                  cause: error,
                },
              );
            }

            throw new HttpException(
              error.message,
              HttpStatus.INTERNAL_SERVER_ERROR,
              {
                cause: error,
              },
            );
          }

          throw error;
        }),
      );
  }
}
