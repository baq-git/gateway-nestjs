import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AxiosError, AxiosResponse } from 'axios';
import { catchError, map, Observable } from 'rxjs';
import { MockbankHttpService } from '../mockbank-http.service';
import {
  CreateRefundPaymentRequestDto,
  CreateRefundPaymentResponseDto,
} from 'src/dtos/mockbank/refund-payment.dto';

@Injectable()
export class RefundService {
  constructor(private httpService: MockbankHttpService) {}

  refund(
    data: CreateRefundPaymentRequestDto,
    idempotencyKey: string,
  ): Observable<AxiosResponse<CreateRefundPaymentResponseDto>> {
    return this.httpService
      .post(`/api/v1/refunds`, data, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      })
      .pipe(
        map((response) => {
          const axiosResponse: AxiosResponse<CreateRefundPaymentResponseDto> = {
            data: response,
            status: 201,
            statusText: 'OK',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            config: {
              method: 'post',
              url: '/api/v1/refunds',
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
