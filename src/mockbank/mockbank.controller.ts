import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseFilters,
  Req,
} from '@nestjs/common';
import { MockbankService } from './mockbank.service';
import { HttpExceptionFilter } from './http-exception.filter';
import { CreateAuthorizePaymentRequestDto } from 'src/dtos/mockbank/authorize-payment.dto';

@Controller('mockbank')
@UseFilters(HttpExceptionFilter)
// @UseInterceptors(IdempotencyLayerInterceptor)
export class MockbankController {
  constructor(private readonly mockbankService: MockbankService) {}

  @Get('/health')
  getMockbankHealth() {
    return this.mockbankService.getHealth();
  }

  @Post('/authorizations')
  authorize(
    @Req() request: Request,
    @Body() data: CreateAuthorizePaymentRequestDto,
  ) {
    const idempotencyKey = request.headers['idempotency-key'];
    return this.mockbankService.authorizations(data, idempotencyKey);
    // .pipe(
    // catchError((error: AxiosError) => {
    //   if (!idempotencyKey) {
    //     throw new HttpException(
    //       'Missing Idempotency-Key header',
    //       HttpStatus.BAD_REQUEST,
    //       { cause: 'Missing Idempotency-Key header' },
    //     );
    //   }
    //
    //   if (error.response?.status === HttpStatus.BAD_REQUEST) {
    //     throw new HttpException(
    //       'Invalid Card: Mockbank authorization request is invalid or validation failed',
    //       HttpStatus.BAD_REQUEST,
    //       {
    //         cause: error,
    //       },
    //     );
    //   }
    //
    //   if (error.response?.status === HttpStatus.PAYMENT_REQUIRED) {
    //     throw new HttpException(
    //       'Invalid Card: Available balance is less than requested amount',
    //       HttpStatus.PAYMENT_REQUIRED,
    //       {
    //         cause: error,
    //       },
    //     );
    //   }
    //
    //   if (error.response?.status === HttpStatus.INTERNAL_SERVER_ERROR) {
    //     throw new HttpException(
    //       error.message,
    //       HttpStatus.INTERNAL_SERVER_ERROR,
    //       {
    //         cause: error,
    //       },
    //     );
    //   }
    //
    //   throw error;
    // }),
    // );
  }

  @Get('/authorizations/:authorizationId')
  async getAuthorization(@Param('authorizationId') authorizationId: string) {
    return this.mockbankService.getAuthorization(authorizationId);
    //   .pipe(
    //   catchError((error: AxiosError) => {
    //     if (error.message === 'invalid_card') {
    //       throw new HttpException(
    //         'Mockbank authorization request is invalid or validation failed',
    //         HttpStatus.BAD_REQUEST,
    //         {
    //           cause: error,
    //         },
    //       );
    //     }
    //     if (error.status === HttpStatus.NOT_FOUND) {
    //       throw new HttpException(
    //         'Mockbank authorization not found',
    //         HttpStatus.NOT_FOUND,
    //         {
    //           cause: error,
    //         },
    //       );
    //     }
    //     throw error;
    //   }),
    // );
  }
}
