import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  RawBodyRequest,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { catchError, concatMap, finalize, Observable, of } from 'rxjs';
import { DataSource, QueryRunner } from 'typeorm';
import { IdempotencyService } from './idempotency.service';
import { compareHash } from '@payments/common/utils/requestHash';

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
      // const response = context.switchToHttp().getResponse<Response>();
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

      request['queryRunner'] = queryRunner;

      const existingIdempotencyEntity =
        await this.idempotencyService.findByKey(idempotencyKey);

      if (existingIdempotencyEntity) {
        if (existingIdempotencyEntity.operation === 'success') {
          compareHash(request, existingIdempotencyEntity);
          return of(existingIdempotencyEntity.responseBody);
        }

        if (existingIdempotencyEntity.operation === 'failure') {
          compareHash(request, existingIdempotencyEntity);
          return of(existingIdempotencyEntity.responseBody);
        }

        if (existingIdempotencyEntity.operation === 'processing')
          throw new HttpException(
            `Conflict: Request rejected. Idempotency key ${idempotencyKey} is associated with a processing state`,
            HttpStatus.CONFLICT,
            {
              cause: `Resource lock contention: Transaction ${idempotencyKey} is currently locked by another process.`,
            },
          );
      }

      if (!existingIdempotencyEntity) {
        await this.idempotencyService.createOrLock(idempotencyKey);

        return next.handle().pipe(
          concatMap(async (result) => {
            try {
              await this.idempotencyService.saveResponse(
                idempotencyKey,
                result,
              );

              await queryRunner.commitTransaction();

              return result;
            } catch (err) {
              await queryRunner.rollbackTransaction();
              throw err;
            }
          }),
          catchError(async (error: HttpException) => {
            if (queryRunner.isTransactionActive) {
              await queryRunner.rollbackTransaction();
            }

            try {
              await this.idempotencyService.saveError(idempotencyKey, error);
            } catch (saveError) {
              Logger.error('Failed to save idempotency error state', saveError);
            }

            return of(error);
          }),
          finalize(async () => {
            if (!queryRunner.isReleased) {
              await queryRunner.release();
            }
          }),
        );
      }

      return next.handle();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
