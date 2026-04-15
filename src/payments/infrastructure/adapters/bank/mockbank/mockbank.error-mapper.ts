import { HttpException, HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';
import {
  MockbankErrorResponseDto,
  MockbankErrorCode,
} from './dtos/errros/error-response.dto';

export class MockBankErrorMapper {
  static toHttpException(error: unknown): HttpException {
    if (!this.isAxiosErrorWithResponse(error)) {
      return new HttpException(
        'Failed to communicate with payment bank. Please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const axiosError = error as AxiosError;
    const responseData = axiosError.response?.data as
      | MockbankErrorResponseDto
      | undefined;

    if (
      !responseData ||
      typeof responseData !== 'object' ||
      !responseData.error
    ) {
      return new HttpException(
        axiosError.message || 'Unknown error from payment bank',
        axiosError.response?.status || HttpStatus.BAD_REQUEST,
      );
    }

    const { error: errorCode, message } = responseData;

    switch (errorCode) {
      case MockbankErrorCode.INVALID_CARD:
      case MockbankErrorCode.INVALID_CVV:
        return new HttpException(
          'Invalid card information',
          HttpStatus.BAD_REQUEST,
        );

      case MockbankErrorCode.CARD_EXPIRED:
        return new HttpException(
          'Card has expired',
          HttpStatus.BAD_REQUEST,
          responseData as any,
        );

      case MockbankErrorCode.INSUFFICIENT_FUNDS:
        return new HttpException(
          `Insufficient funds: ${message}`,
          HttpStatus.PAYMENT_REQUIRED,
          responseData as any,
        );

      case MockbankErrorCode.AUTHORIZATION_EXPIRED:
        return new HttpException(
          `Authorization has expired: ${message}`,
          HttpStatus.GONE,
          responseData as any,
        );

      case MockbankErrorCode.AUTHORIZATION_NOT_FOUND:
      case MockbankErrorCode.CAPTURE_NOT_FOUND:
      case MockbankErrorCode.REFUND_NOT_FOUND:
        return new HttpException(
          'Resource not found',
          HttpStatus.NOT_FOUND,
          responseData as any,
        );

      case MockbankErrorCode.ALREADY_CAPTURED:
      case MockbankErrorCode.ALREADY_VOIDED:
      case MockbankErrorCode.ALREADY_REFUNDED:
        return new HttpException(
          `This operation has already been ${errorCode.replace('already_', '')}`,
          HttpStatus.BAD_REQUEST,
          responseData as any,
        );

      case MockbankErrorCode.AMOUNT_MISMATCH:
        return new HttpException(
          'Amount does not match the original transaction',
          HttpStatus.BAD_REQUEST,
          responseData as any,
        );

      case MockbankErrorCode.INTERNAL_ERROR:
        return new HttpException(
          'Bank internal error. Please try again later',
          HttpStatus.INTERNAL_SERVER_ERROR,
          responseData as any,
        );

      default:
        return new HttpException(
          message || `Bank error: ${errorCode}`,
          axiosError.response?.status || HttpStatus.BAD_REQUEST,
          responseData as any,
        );
    }
  }

  private static isAxiosErrorWithResponse(error: unknown): boolean {
    if (!(error instanceof AxiosError)) {
      return false;
    }
    return !!(error.response && error.response.data);
  }
}
