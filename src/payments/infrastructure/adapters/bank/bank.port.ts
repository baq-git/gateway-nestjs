import { CreateAuthorizationMockBankRequestDto } from './mockbank/dtos/requests/authorize-mockbank.request.dto';
import { CreateCaptureRequestDto } from './mockbank/dtos/requests/capture-mockbank.request.dto';
import { CreateRefundRequestDto } from './mockbank/dtos/requests/refund-mockbank.request.dto';
import { CreateVoidRequestDto } from './mockbank/dtos/requests/void-mockbank.request.dto';
import { AuthorizationResponseDto } from './mockbank/dtos/responses/authorize-mockbank.response.dto';
import { CaptureResponseDto } from './mockbank/dtos/responses/capture-mockbank.response.dto';
import { RefundResponseDto } from './mockbank/dtos/responses/refund-mockbank.response.dto';
import { VoidResponseDto } from './mockbank/dtos/responses/void-mockbank.response.dto';

export interface BankPort {
  getAuthorization(authorizationId: string): Promise<AuthorizationResponseDto>;
  authorize(
    data: CreateAuthorizationMockBankRequestDto,
    idempotencyKey: string,
  ): Promise<AuthorizationResponseDto>;
  capture(
    data: CreateCaptureRequestDto,
    idempotencyKey: string,
  ): Promise<CaptureResponseDto>;
  void(
    data: CreateVoidRequestDto,
    idempotencyKey: string,
  ): Promise<VoidResponseDto>;
  refund(
    data: CreateRefundRequestDto,
    idempotencyKey: string,
  ): Promise<RefundResponseDto>;
}
