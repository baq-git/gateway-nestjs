import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { MockbankHttpService } from '../mockbank-http.service';
import { catchError, map, Observable } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import {
  GetCapturePaymentResponseDto,
  CreateCapturePaymentRequestDto,
  CreateCapturePaymentResponseDto,
} from 'src/dtos/mockbank/capture-payment.dto';

@Injectable()
export class CaptureService {
  constructor(private readonly httpService: MockbankHttpService) {}

  getCaptures(
    authorizationId: string,
  ): Observable<AxiosResponse<GetCapturePaymentResponseDto>> {
    const authId = `auth_${authorizationId}`;
    return this.httpService
      .get(`/api/v1/captures/${authId}`, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      })
      .pipe(
        map((response) => {
          const axiosResponse: AxiosResponse<GetCapturePaymentResponseDto> = {
            data: response,
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            config: {
              url: '/api/v1/captures',
              method: 'get',
            } as any,
          };
          return axiosResponse;
        }),
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

  captures(
    data: CreateCapturePaymentRequestDto,
    idempotencyKey: string,
  ): Observable<AxiosResponse<CreateCapturePaymentResponseDto>> {
    return this.httpService
      .post(`/api/v1/captures`, data, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      })
      .pipe(
        map((response) => {
          const axiosResponse: AxiosResponse<CreateCapturePaymentResponseDto> =
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
                url: '/api/v1/captures',
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
              'Invalid Card: Available balance is less than requested amount',
              HttpStatus.BAD_REQUEST,
              {
                cause: error,
              },
            );
          }

          if (error.response?.status === HttpStatus.INTERNAL_SERVER_ERROR) {
            if (error.response?.data) {
              throw new HttpException(
                'Invalid Card: Available balance is less than requested amount',
                HttpStatus.INTERNAL_SERVER_ERROR,
                {
                  cause: error,
                },
              );
            }

            throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR, {
              cause: error,
            });
          }

          throw error;
        }),
      );
  }
}
