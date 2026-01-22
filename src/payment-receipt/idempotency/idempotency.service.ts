import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { IdempotencyKey } from '../entity/idempotency-keys.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner } from 'typeorm/browser';
import { Request } from 'express';
import { PaymentReceiptResponseSuccessDto } from 'src/dtos/payment-receipt/payment-receipt.dto';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepository: Repository<IdempotencyKey>,
  ) {}

  async ensureCreatedAndCheckIdempotencyKey(
    request: Request,
    idempotencyKey: string,
    queryRunner: QueryRunner,
  ) {
    try {
      // Use ON CONFLICT DO NOTHING when:
      // You want the best performance and only care about
      // whether the data is in the table or not.

      const onConflictInserted = await this.idempotencyRepository
        .createQueryBuilder()
        .insert()
        .into(IdempotencyKey)
        .values({
          key: idempotencyKey,
          requestPath: request.url,
          operation: 'processing',
          expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 3 minutes
        })
        // .orIgnore()
        .returning('*')
        .execute();

      if (onConflictInserted.raw.length > 0) {
        return {
          statusCode: HttpStatus.CREATED,
          statusText:
            'Idempotency Entity created with status code 201 with processing status',
          data: {
            result: onConflictInserted,
          },
        };
      } else {
        const existingIdempotencyEntity = await queryRunner.manager
          .getRepository(IdempotencyKey)
          .createQueryBuilder('idempotencyKey')
          .setLock('pessimistic_write')
          .where('idempotencyKey.key = :key', { key: idempotencyKey })
          .getOne()
          .catch((error) => {
            throw new HttpException(
              'Idempotency processing error',
              HttpStatus.INTERNAL_SERVER_ERROR,
              {
                cause: error,
              },
            );
          });

        if (!existingIdempotencyEntity) {
          throw new HttpException(
            'Idempotency Entity not found',
            HttpStatus.NOT_FOUND,
          );
        }

        switch (existingIdempotencyEntity.operation) {
          case 'success':
            return {
              idempotencyMetadata: {
                statusCode: existingIdempotencyEntity.responseStatus,
                operation: 'success',
                statusText:
                  'Idempotency Entity operation check success, return the cached response body',
              },
              paymentReceipt: {
                data: existingIdempotencyEntity.responseBody,
              },
            };

          case 'processing':
            if (existingIdempotencyEntity.expiresAt.getTime() < Date.now()) {
              // expired
              const expiredAt = existingIdempotencyEntity.expiresAt;
              const deleted = await this.idempotencyRepository.delete({
                key: existingIdempotencyEntity.key,
              });

              return {
                idempotencyMetadata: {
                  statusCode: HttpStatus.CONFLICT,
                  operation: 'processing',
                  statusText:
                    'Request is already expired for this Idempotency Key - Please retry',
                },
                paymentReceipt: {
                  data: {
                    expriedAt: new Date(expiredAt).toString(),
                    now: Date(),
                    deleted,
                  },
                },
              };
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
                    data: {
                      expriedAt: new Date(
                        existingIdempotencyEntity.expiresAt,
                      ).toString(),
                      now: Date(),
                    },
                  },
                },
              );
            }

          case 'failure':
            return {
              idempotencyMetadata: {
                statusCode: HttpStatus.CONFLICT,
                operation: 'failure',
                statusText: 'Request is already failed with idempotency key',
              },
              paymentReceipt: {
                data: existingIdempotencyEntity.responseBody.data,
                statusCode: existingIdempotencyEntity.responseBody.statusCode,
                statusText: existingIdempotencyEntity.responseBody.statusText,
              },
            };

          default:
            throw new HttpException(
              'Conflict: Idempotency Entity operation check failed',
              HttpStatus.CONFLICT,
              {
                cause: 'Idempotency operation is not in correct status',
              },
            );
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async updateToSuccessIdempotency(
    idempotencyKey: string,
    result: PaymentReceiptResponseSuccessDto,
    queryRunner: QueryRunner,
  ) {
    try {
      console.log('updateToSuccessIdempotency to success');
      const existingIdempotencyEntity = await queryRunner.manager
        .getRepository(IdempotencyKey)
        .findOne({
          where: {
            key: idempotencyKey,
          },
          lock: {
            mode: 'pessimistic_write',
          },
        });

      if (!existingIdempotencyEntity) {
        throw new HttpException(
          'Idempotency Entity not found',
          HttpStatus.NOT_FOUND,
          {
            cause:
              'Idempotency Entity not found when updateToSuccessIdempotency',
          },
        );
      }

      existingIdempotencyEntity.responseBody = result.data;
      existingIdempotencyEntity.responseStatus =
        result.statusCode || HttpStatus.CREATED;
      existingIdempotencyEntity.operation = 'success';

      await queryRunner.manager.save(existingIdempotencyEntity);

      return {
        statusCode: HttpStatus.CREATED,
        statusText:
          'Idempotency Entity operation update to success successfully',
        operation: existingIdempotencyEntity.operation,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Update Idempotency operation to success failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
        {
          cause: error,
        },
      );
    }
  }

  async updateToFailureIdempotency(
    idempotencyKey: string,
    error: HttpException,
    queryRunner: QueryRunner,
  ) {
    try {
      console.log('updateToFailureIdempotency to failure');
      const existingIdempotencyEntity = await queryRunner.manager
        .getRepository(IdempotencyKey)
        .findOne({
          where: {
            key: idempotencyKey,
          },
          lock: {
            mode: 'pessimistic_write',
          },
        });

      if (!existingIdempotencyEntity) {
        throw new HttpException(
          'Idempotency Entity not found',
          HttpStatus.NOT_FOUND,
          {
            cause:
              'Idempotency Entity not found when updateToFailureIdempotency',
          },
        );
      }

      existingIdempotencyEntity.responseBody = error.cause;
      existingIdempotencyEntity.responseStatus =
        error.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR;
      existingIdempotencyEntity.operation = 'failure';

      await queryRunner.manager.save(existingIdempotencyEntity);

      return {
        statusCode: HttpStatus.OK,
        statusText:
          'Idempotency Entity operation update to failure successfully - return failure response body',
        operation: existingIdempotencyEntity.operation,
        payload: existingIdempotencyEntity,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Update Idempotency operation to success failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
        {
          cause: error,
        },
      );
    }
  }
}
