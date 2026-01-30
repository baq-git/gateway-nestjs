import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NestInterceptor,
  RawBodyRequest,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Request, Response } from 'express';
import { catchError, concatMap, finalize, Observable, of } from 'rxjs';
import { DataSource, QueryRunner } from 'typeorm';
import { IdempotencyService } from './idempotency/idempotency.service';
import { compareHash } from './utils/requestHash';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IdempotencyService)
    private readonly idempotencyService: IdempotencyService,
    @Inject(DataSource)
    private readonly dataSource: DataSource,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const request = context
        .switchToHttp()
        .getRequest<RawBodyRequest<Request & { queryRunner: QueryRunner }>>();

      const response = context.switchToHttp().getResponse<Response>();

      const idempotencyKey = request.get('Idempotency-Key') as string;

      if (!idempotencyKey) {
        throw new HttpException(
          "Header 'idempotency-key' is required",
          HttpStatus.BAD_REQUEST,
          {
            cause: 'Missing Idempotency-Key header',
          },
        );
      }

      if (!isUUID(idempotencyKey)) {
        throw new HttpException(
          "Header 'idempotency-key' is not a valid UUID",
          HttpStatus.BAD_REQUEST,
        );
      }

      request.queryRunner = queryRunner;

      const existingIdempotencyEntity =
        await this.idempotencyService.findOneByKey(idempotencyKey, queryRunner);

      if (!existingIdempotencyEntity) {
        await this.idempotencyService.insertIdempotencyEntity(
          request,
          idempotencyKey,
        );

        return next.handle().pipe(
          concatMap(async (result) => {
            try {
              await this.idempotencyService.updateToSuccessIdempotency(
                idempotencyKey,
                result,
                queryRunner,
              );

              await queryRunner.commitTransaction();

              return result;
            } catch (err) {
              await queryRunner.rollbackTransaction();
              throw err;
            }
          }),
          catchError(async (error: HttpException) => {
            try {
              await this.idempotencyService.updateToFailureIdempotency(
                idempotencyKey,
                error,
                queryRunner,
              );

              await queryRunner.commitTransaction();
            } catch (updateError) {
              await queryRunner.rollbackTransaction();
              throw updateError;
            }
          }),
          finalize(async () => {
            if (!queryRunner.isReleased) {
              await queryRunner.release();
            }
          }),
        );
      }

      // it is existing
      const operationStatusCode = {
        success: HttpStatus.OK,
        failure: HttpStatus.OK,
        processing: HttpStatus.CONFLICT,
        expired: HttpStatus.CONFLICT,
      };

      if (!(existingIdempotencyEntity.operation in operationStatusCode)) {
        throw new HttpException(
          'Conflict: Idempotency Entity operation check failed',
          HttpStatus.CONFLICT,
          {
            cause: 'Idempotency operation is not in correct status',
          },
        );
      }

      if (existingIdempotencyEntity) {
        const statusCode =
          operationStatusCode[existingIdempotencyEntity.operation];
        response.status(statusCode);

        compareHash(request, existingIdempotencyEntity);

        if (existingIdempotencyEntity.operation === 'processing') {
          if (existingIdempotencyEntity.expiresAt.getTime() < Date.now()) {
            const deleted = await this.idempotencyService.deleteByKey(
              existingIdempotencyEntity.key,
            );

            return of({
              statusCode,
              message:
                'Request is already expired for this Idempotency Key - Please retry',
              data: {
                paymentReceipt: {
                  expriedAt: new Date(
                    existingIdempotencyEntity.expiresAt,
                  ).toString(),
                  now: Date(),
                  deleted,
                },
              },
            });
          } else {
            function getRemainingTime(expiresAt: Date) {
              const now = new Date();
              const timeDiff = expiresAt.getTime() - now.getTime();

              if (timeDiff <= 0) return '0 seconds';

              const totalSeconds = Math.floor(timeDiff / 1000);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;

              if (minutes > 0) {
                return `${minutes} minute${minutes > 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`;
              }
              return `${seconds} second${seconds !== 1 ? 's' : ''}`;
            }

            throw new HttpException(
              `Conflict: Request is already processing for this Idempotency Key - Please retry after ${getRemainingTime(existingIdempotencyEntity.expiresAt)}`,
              HttpStatus.CONFLICT,
              {
                cause: {
                  paymentReceipt: {
                    expriedAt: new Date(
                      existingIdempotencyEntity.expiresAt,
                    ).toString(),
                    now: Date(),
                    key: existingIdempotencyEntity.key,
                  },
                },
              },
            );
          }
        }

        return of({
          statusCode,
          message: `Idempotency Entity operation check ${existingIdempotencyEntity.operation}, return the cached response body`,
          data: existingIdempotencyEntity.responseBody,
        });
      }

      return next.handle();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }
}
