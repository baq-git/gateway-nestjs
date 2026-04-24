import { CreateAuthorizationMockBankRequestDto } from './mockbank/dtos/requests/authorize-mockbank.request.dto';
import { CreateCaptureMockBankRequestDto } from './mockbank/dtos/requests/capture-mockbank.request.dto';
import { CreateRefundMockBankRequestDto } from './mockbank/dtos/requests/refund-mockbank.request.dto';
import { CreateVoidMockBankRequestDto } from './mockbank/dtos/requests/void-mockbank.request.dto';
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
    data: CreateCaptureMockBankRequestDto,
    idempotencyKey: string,
  ): Promise<CaptureResponseDto>;
  void(
    data: CreateVoidMockBankRequestDto,
    idempotencyKey: string,
  ): Promise<VoidResponseDto>;
  refund(
    data: CreateRefundMockBankRequestDto,
    idempotencyKey: string,
  ): Promise<RefundResponseDto>;
}
