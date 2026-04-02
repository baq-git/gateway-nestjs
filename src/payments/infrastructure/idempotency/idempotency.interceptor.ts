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
import { compareHash } from '@common/utils/requestHash';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

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
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request & { queryRunner: QueryRunner }>>();

    // const response = context.switchToHttp().getResponse<Response>();
    const idempotencyKey = request.get('idempotency-key')?.trim();

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

    const existingIdempotencyEntity =
      await this.idempotencyService.findByKey(idempotencyKey);

    if (existingIdempotencyEntity) {
      if (existingIdempotencyEntity.operation === 'success') {
        compareHash(request, existingIdempotencyEntity);
        return of(existingIdempotencyEntity.responseBody);
      }

      if (existingIdempotencyEntity.operation === 'processing')
        throw new HttpException(
          `Conflict: Request rejected. Idempotency key ${idempotencyKey} is still processing`,
          HttpStatus.CONFLICT,
          {
            cause: `Resource lock contention: Transaction in ${idempotencyKey} key is currently locked by another process.`,
          },
        );

      if (existingIdempotencyEntity.operation === 'failure') {
        this.logger.warn(`Retrying failed idempotency key: ${idempotencyKey}`);
        return of('retry');
        // Tiếp tục xử lý như request mới (không replay error)
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.startTransaction();
      request['queryRunner'] = queryRunner;

      await this.idempotencyService.createOrLock(idempotencyKey);

      return next.handle().pipe(
        concatMap(async (result) => {
          try {
            await this.idempotencyService.saveResponse(idempotencyKey, result);
            await queryRunner.commitTransaction();
            return result;
          } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
          }
        }),

        catchError(async (error: any) => {
          if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
          }

          try {
            await this.idempotencyService.saveError(idempotencyKey, error);
          } catch (saveErr) {
            // this.logger.error(
            //   `Failed to save error state for idempotency key ${idempotencyKey}`,
            //   saveErr,
            // );
          }

          throw error;
        }),

        finalize(async () => {
          if (!queryRunner.isReleased) {
            await queryRunner.release();
          }
        }),
      );
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }
}
