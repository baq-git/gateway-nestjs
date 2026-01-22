import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { MockbankHttpService } from '../mockbank-http.service';
import { catchError, map, Observable } from 'rxjs';
import { AxiosResponse } from 'axios';
import { AxiosError } from 'axios';
import {
  CreateVoidPaymentRequestDto,
  CreateVoidPaymentResponseDto,
} from 'src/dtos/mockbank/void-payment.dto';

@Injectable()
export class VoidService {
  constructor(private readonly httpService: MockbankHttpService) {}

  void(
    data: CreateVoidPaymentRequestDto,
    idempotencyKey: string,
  ): Observable<AxiosResponse<CreateVoidPaymentResponseDto>> {
    return this.httpService
      .post(`/api/v1/voids`, data, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      })
      .pipe(
        map((response) => {
          const axiosResponse: AxiosResponse<CreateVoidPaymentResponseDto> = {
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
              url: '/api/v1/voids',
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

          throw error;
        }),
      );
  }
}
