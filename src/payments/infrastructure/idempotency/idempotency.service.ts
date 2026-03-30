import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type RawBodyRequest,
  Scope,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner } from 'typeorm';
import { IdempotencyKeyEntity } from '@domain/entities/idempotency-keys.entity';
import { type Request } from 'express';
import { REQUEST } from '@nestjs/core';
import { computeRequestFingerprint } from '@common/utils/requestHash';

@Injectable({ scope: Scope.REQUEST })
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKeyEntity)
    private readonly idempotencyRepository: Repository<IdempotencyKeyEntity>,
    @Inject(REQUEST)
    private request: RawBodyRequest<Request>,
  ) {}

  async getStatus(idempotencyKey: string) {
    const idkEntity = await this.idempotencyRepository.findOne({
      where: {
        key: idempotencyKey,
      },
    });

    return {
      status: idkEntity?.operation,
      body: idkEntity?.responseBody,
    };
  }

  async findByKey(idempotencyKey: string) {
    if (
      !idempotencyKey ||
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.trim().length === 0
    ) {
      throw new BadRequestException(
        'Idempotency-Key cannot be empty or whitespace',
      );
    }

    return await this.idempotencyRepository.findOne({
      where: {
        key: idempotencyKey,
      },
    });
  }

  async createOrLock(idempotencyKey: string) {
    //NOTE: IMPORTAINT: DONT USE SAVE, USE INSERT TO THROW UNIQUE CONSTRAINTS VIOLATION
    const queryRunner: QueryRunner = this.request['queryRunner'];
    const requestHash = computeRequestFingerprint(this.request);
    try {
      let lockedIdempotencyEntity = await queryRunner.manager
        .createQueryBuilder(IdempotencyKeyEntity, 'ik')
        .setLock('pessimistic_write')
        .where('ik.key = :key', { key: idempotencyKey })
        .getOne();

      if (lockedIdempotencyEntity) {
        const operation = lockedIdempotencyEntity.operation;
        if (operation === 'processing') {
          throw new HttpException(
            `Conflict: Request rejected. Idempotency key ${idempotencyKey} is associated with a processing state`,
            HttpStatus.CONFLICT,
            {
              cause: `Resource lock contention: Transaction ${idempotencyKey} is currently locked by another process.`,
            },
          );
        }

        if (operation === 'success') {
          throw new ConflictException('Request already succeeded.');
        }

        if (operation === 'failure') {
          // retry
          console.log('should retry');

          // throw new
        }

        if (!['failure', 'processing', 'success'].includes(operation)) {
          throw new HttpException(
            'Request is unknow operation',
            HttpStatus.BAD_REQUEST,
            { cause: 'Unknow operation status' },
          );
        }
      } else {
        lockedIdempotencyEntity = queryRunner.manager.create(
          IdempotencyKeyEntity,
          {
            key: idempotencyKey,
            requestPath: this.request.path,
            operation: 'processing',
            requestHash: requestHash,
            responseStatus: HttpStatus.CREATED,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        );

        const result = await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(IdempotencyKeyEntity)
          .values([lockedIdempotencyEntity])
          .returning('*')
          .execute();

        return result.generatedMaps[0];
      }
    } catch (error) {
      if (error.code === '23505') {
        throw new HttpException(
          'Conflict: An active request with this idempotency key is already in progress or has been completed.',
          HttpStatus.CONFLICT,
          {
            cause: error.detail,
          },
        );
      }

      if (error.code === '25P02') {
        throw new HttpException(
          'Conflict: Transaction aborted due to a previous error.',
          HttpStatus.CONFLICT,
          {
            cause: error.driverError,
          },
        );
      }

      throw error;
    }
  }

  async saveResponse(idempotencyKey: string, result: any) {
    const queryRunner: QueryRunner = this.request['queryRunner'];

    const existingIdempotencyKey = await queryRunner.manager
      .createQueryBuilder(IdempotencyKeyEntity, 'ik')
      .setLock('pessimistic_write')
      .where('idempotency_keys = :key', { key: idempotencyKey })
      .getOne();

    if (existingIdempotencyKey) {
      existingIdempotencyKey.operation = 'success';
      existingIdempotencyKey.responseBody = result;
      existingIdempotencyKey.responseStatus = 200;
      await queryRunner.manager.save(existingIdempotencyKey);
    }
  }

  async saveError(idempotencyKey: string, error: any) {
    await this.idempotencyRepository.update(
      { key: idempotencyKey },
      {
        operation: 'failure',
        responseBody: error.response || error.message,
        responseStatus: error.status || 500,
        updateAt: new Date(),
      },
    );
  }
}
