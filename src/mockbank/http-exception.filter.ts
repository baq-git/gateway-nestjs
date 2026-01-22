import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const statusCode = exception.getStatus();
    const message = exception.message;
    const path = request.url;

    response.status(exception.getStatus()).json({
      message,
      statusCode,
      path,
      timestamp: new Date().toISOString(),
    });
  }
}
