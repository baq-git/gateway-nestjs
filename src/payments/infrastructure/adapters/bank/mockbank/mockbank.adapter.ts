import { Injectable } from '@nestjs/common';
import { AuthorizationResponseDto } from './dtos/responses/authorize-mockbank.response.dto';
import { CreateCaptureMockBankRequestDto } from './dtos/requests/capture-mockbank.request.dto';
import { CaptureResponseDto } from './dtos/responses/capture-mockbank.response.dto';
import { CreateVoidMockBankRequestDto } from './dtos/requests/void-mockbank.request.dto';
import { VoidResponseDto } from './dtos/responses/void-mockbank.response.dto';
import { CreateRefundMockBankRequestDto } from './dtos/requests/refund-mockbank.request.dto';
import { RefundResponseDto } from './dtos/responses/refund-mockbank.response.dto';
import { firstValueFrom } from 'rxjs';
import { MockBankHttpService } from './mockbank.http.service';
import { MockBankErrorMapper } from './mockbank.error-mapper';
import { CreateAuthorizationMockBankRequestDto } from './dtos/requests/authorize-mockbank.request.dto';
import { type BankPort } from '../bank.port';

@Injectable()
export class MockBankAdapter implements BankPort {
  constructor(private readonly mockBankHttpService: MockBankHttpService) {}

  async getAuthorization(
    authorizationId: string,
  ): Promise<AuthorizationResponseDto> {
    try {
      const result = await firstValueFrom(
        this.mockBankHttpService.get(
          `/api/v1/authorizations/${authorizationId}`,
        ),
      );

      return result;
    } catch (error) {
      throw MockBankErrorMapper.toHttpException(error);
    }
  }

  async authorize(
    data: CreateAuthorizationMockBankRequestDto,
    idempotencyKey: string,
  ): Promise<AuthorizationResponseDto> {
    console.log('authorize called');
    try {
      const result = await firstValueFrom(
        this.mockBankHttpService.post(`/api/v1/authorizations`, data, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
        }),
      );

      return result;
    } catch (error) {
      throw MockBankErrorMapper.toHttpException(error);
    }
  }

  async capture(
    data: CreateCaptureMockBankRequestDto,
    idempotencyKey: string,
  ): Promise<CaptureResponseDto> {
    try {
      const result = await firstValueFrom(
        this.mockBankHttpService.post(`/api/v1/captures`, data, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
        }),
      );

      return result;
    } catch (error) {
      throw MockBankErrorMapper.toHttpException(error);
    }
  }

  async refund(
    data: CreateRefundMockBankRequestDto,
    idempotencyKey: string,
  ): Promise<RefundResponseDto> {
    try {
      const result = await firstValueFrom(
        this.mockBankHttpService.post(`/api/v1/refunds`, data, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
        }),
      );

      return result;
    } catch (error) {
      throw MockBankErrorMapper.toHttpException(error);
    }
  }

  async void(
    data: CreateVoidMockBankRequestDto,
    idempotencyKey: string,
  ): Promise<VoidResponseDto> {
    try {
      const result = await firstValueFrom(
        this.mockBankHttpService.post(`/api/v1/voids`, data, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
        }),
      );

      return result;
    } catch (error) {
      throw MockBankErrorMapper.toHttpException(error);
    }
  }
}
