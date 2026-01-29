import {
  HttpException,
  HttpStatus,
  Injectable,
  type RawBodyRequest,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { IdempotencyKey } from '../entity/idempotency-keys.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { type QueryRunner } from 'typeorm/browser';
import { Request } from 'express';
import { PaymentReceiptResponseSuccessDto } from 'src/dtos/payment-receipt/payment-receipt.dto';
import { createHash } from 'crypto';
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepository: Repository<IdempotencyKey>,
  ) {}

  async findOneByKey(idempotencyKey: string, queryRunner: QueryRunner) {
    return queryRunner.manager.getRepository(IdempotencyKey).findOne({
      where: {
        key: idempotencyKey,
      },
      lock: {
        mode: 'pessimistic_write',
      },
    });
  }

  async deleteByKey(key: string) {
    return this.idempotencyRepository.delete({ key });
  }

  async insertIdempotencyEntity(
    request: RawBodyRequest<Request & { queryRunner: QueryRunner }>,
    idempotencyKey: string,
  ) {
    const queryRunner = request.queryRunner; // request hash to prevent reply attack
    const requestHash = this.computeRequestFingerprint(request); // Use ON CONFLICT DO NOTHING when:
    // YOU WANT THE BEST PERFORMANCE AND ONLY CARE ABOUT
    // WHETHER THE DATA IS IN THE TABLE OR NOT.
    const insertQuery = queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into(IdempotencyKey)
      .values({
        key: idempotencyKey,
        requestPath: request.path,
        requestHash,
        responseStatus: HttpStatus.CREATED,
        operation: 'processing',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tăng lên 24h
      })
      .orIgnore()
      .returning('*');

    const result = await insertQuery.execute();
    if (result.raw.length === 0) {
      const existing = await queryRunner.manager
        .getRepository(IdempotencyKey)
        .createQueryBuilder('ik')
        .setLock('pessimistic_write')
        .where('ik.key = :key', { key: idempotencyKey })
        .getOneOrFail();

      if (existing.requestHash !== requestHash) {
        throw new HttpException(
          'Idempotency-Key reused with different payload',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      return { alreadyExists: true, entity: existing };
    }
    return { inserted: true, entity: result.raw[0] };
  }
  async updateToSuccessIdempotency(
    idempotencyKey: string,
    result: PaymentReceiptResponseSuccessDto,
    queryRunner: QueryRunner,
  ) {
    try {
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
      existingIdempotencyEntity.responseBody = result;
      existingIdempotencyEntity.responseStatus =
        result.statusCode || HttpStatus.CREATED;
      existingIdempotencyEntity.operation = 'success';
      await queryRunner.manager.save(existingIdempotencyEntity);
      return {
        statusText:
          'Idempotency Entity operation update to success successfully',
        operation: existingIdempotencyEntity.operation,
        data: existingIdempotencyEntity,
      };
    } catch (err) {
      console.log('updateToSuccessIdempotency error', err.message);
    }
  }
  async updateToFailureIdempotency(
    idempotencyKey: string,
    error: HttpException,
    queryRunner: QueryRunner,
  ) {
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
          cause: 'Idempotency Entity not found when updateToFailureIdempotency',
        },
      );
    }
    existingIdempotencyEntity.responseBody = error;
    existingIdempotencyEntity.responseStatus =
      error.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR;
    existingIdempotencyEntity.operation = 'failure';
    const result = await this.idempotencyRepository.save(
      existingIdempotencyEntity,
    );
    return {
      statusText:
        'Idempotency Entity operation update to failure successfully - return failure response body',
      operation: result.operation,
      payload: result,
    };
  }
  private computeRequestFingerprint(request: RawBodyRequest<Request>) {
    const hash = createHash('sha256');
    const method = (request.method || 'POST').toUpperCase();
    hash.update(method);
    hash.update('\0');
    hash.update(request.method + request.path);
    hash.update(request.path || '');
    hash.update('\0');
    const rawBody = request.rawBody;
    if (Buffer.isBuffer(rawBody)) {
      hash.update(rawBody);
    } else {
      console.warn('RawBody is not Buffer:', typeof rawBody);
      hash.update(''); // fallback empty
    }
    const fingerprint = hash.digest('hex');
    return fingerprint;
  }
  private compareHash(
    request: RawBodyRequest<Request>,
    existingIdempotencyEntity: IdempotencyKey,
  ) {
    const currentPayloadHash = this.computeRequestFingerprint(request);
    if (existingIdempotencyEntity.requestHash !== currentPayloadHash) {
      throw new HttpException(
        'Bad Request: Idempotency-Key reused with different payload',
        HttpStatus.UNPROCESSABLE_ENTITY,
        {
          cause: {
            message: 'Payload mismatch - request body/method/path has changed',
          },
        },
      );
    }
  }
}
