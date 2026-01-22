import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { HttpStatusCode } from 'axios';
import { catchError, Observable, of, tap } from 'rxjs';
import { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { IdempotencyKey } from '../entity/idempotency-keys.entity';
@Injectable()
export class PaymentReceiptInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyKeyRepository: Repository<IdempotencyKey>,
  ) {}
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const idempotencyKey = request.get('idempotency-key') as string;

    if (!idempotencyKey) {
      throw new HttpException(
        "Header 'idempotency-key' is required",
        HttpStatusCode.BadRequest,
        {
          cause: 'Missing Idempotency-Key header',
        },
      );
    }
    if (!isUUID(idempotencyKey)) {
      throw new HttpException(
        "Header 'idempotency-key' is not a valid UUID",
        HttpStatusCode.BadRequest,
      );
    }

    try {
      const newRecord = this.idempotencyKeyRepository.create({
        key: idempotencyKey,
        requestPath: request.url,
        operation: 'processing',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      });

      await this.idempotencyKeyRepository.insert(newRecord);
    } catch (error) {
      if (error.code === '23505') {
        const existingIdemtempotencyEntity =
          await this.idempotencyKeyRepository.findOne({
            where: {
              key: idempotencyKey,
            },
          });
        if (!existingIdemtempotencyEntity) {
          throw new HttpException(
            'Idempotency processing error',
            HttpStatusCode.InternalServerError,
          );
        }
        switch (existingIdemtempotencyEntity.operation) {
          case 'processing':
            console.log(
              'payment request is success with idempotency key: ',
              existingIdemtempotencyEntity.key,
            );
            throw new HttpException(
              'Request is already processing for this Idempotency Key',
              HttpStatusCode.Conflict,
              {
                cause: 'Conflict: Idempotency Key is already processing',
              },
            );
          case 'success':
            console.log(
              'payment request is success with idempotency key: ',
              existingIdemtempotencyEntity.key,
            );
            return of(existingIdemtempotencyEntity.responseBody);
          case 'failure':
            console.log(
              'payment request is already failed with idempotency key: ',
              existingIdemtempotencyEntity.key,
            );
            return of(existingIdemtempotencyEntity.responseBody);
          default:
            console.log(
              'payment request is already failed with idempotency key: ',
              existingIdemtempotencyEntity.key,
            );
            throw new HttpException(
              'Conflice: Idempotency Entity operation check failed',
              HttpStatusCode.Conflict,
              {
                cause: 'Idempotency operation is not in correct status',
              },
            );
        }
      }
    }
    return next.handle().pipe(
      tap((res) => {
        console.log('last response:', res);
        this.idempotencyKeyRepository.update(
          {
            key: idempotencyKey,
          },
          {
            operation: 'success',
            responseStatus: response.statusCode || HttpStatusCode.Created,
            responseBody: res,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        );
        return res;
      }),
      catchError((error) => {
        let status =
          error.status ||
          error.response?.status ||
          HttpStatusCode.InternalServerError;
        let body = error.response?.data || { message: error.message };
        if (error instanceof HttpException) {
          status = error.getStatus();
          const response = error.getResponse();
          body =
            typeof response === 'string' ? { message: response } : response;
        }
        this.idempotencyKeyRepository.update(
          { key: idempotencyKey },
          {
            operation: 'failure',
            responseStatus: status,
            responseBody: body,
          },
        );
        return error;
      }),
    );
  }
}
