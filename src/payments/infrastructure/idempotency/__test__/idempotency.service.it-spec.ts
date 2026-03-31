import { IdempotencyKeyEntity } from '@domain/entities/idempotency-keys.entity';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { IdempotencyService } from '../idempotency.service';
import { TestingModule, Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { TestDatabase } from '../../../../../test/database.setup';
import { PaymentEntity } from '@domain/entities/payment.entity';
import { HttpException, HttpStatus, type RawBodyRequest } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { type Request } from 'express';
import { createMock } from '@golevelup/ts-jest';
import { QueryRunner } from 'typeorm/browser';

describe('Idempotency Intergration Tests', () => {
  let idkService: IdempotencyService;
  let idkRepository: Repository<IdempotencyKeyEntity>;
  let dataSource: DataSource;
  let request: Request;

  afterAll(async () => {
    await TestDatabase.stop();
  });

  beforeEach(async () => {
    const dbInfo = await TestDatabase.start();
    request = createMock<RawBodyRequest<Request>>({
      method: 'POST',
      path: '/payments',
      headers: {},
      body: {},
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TestDatabase.getTypeOrmConfig(dbInfo),
        TypeOrmModule.forFeature([IdempotencyKeyEntity, PaymentEntity]),
      ],
      providers: [
        IdempotencyService,
        {
          provide: getRepositoryToken(IdempotencyKeyEntity),
          useFactory: (connection) => connection.getRepository(idkRepository),
          inject: [DataSource],
        },
        {
          provide: REQUEST,
          useValue: request,
        },
      ],
    }).compile();

    idkService = await module.resolve<IdempotencyService>(IdempotencyService);
    idkRepository = module.get<Repository<IdempotencyKeyEntity>>(
      getRepositoryToken(IdempotencyKeyEntity),
    );
    dataSource = module.get(DataSource);
    request['queryRunner'] = dataSource.createQueryRunner();
  }, 60000);

  afterEach(async () => {
    await TestDatabase.stop();
  });

  describe('createOrLock method', () => {
    describe('Unique Constraint Violation', () => {
      it('should throw QueryFailedError when inserting duplicate idempotency key', async () => {
        const queryRunner: QueryRunner = request['queryRunner'];

        const testKey = 'cd84068a-8de2-411f-9db7-9636d77a3a09';
        const entity1 = queryRunner.manager.create(IdempotencyKeyEntity, {
          key: testKey,
          requestPath: 'test/path',
          operation: 'processing',
          requestHash: 'hash-001',
          responseStatus: HttpStatus.CREATED,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        await queryRunner.manager.insert(IdempotencyKeyEntity, entity1);

        const entity2 = queryRunner.manager.create(IdempotencyKeyEntity, {
          key: testKey,
          requestPath: 'test/path',
          operation: 'processing',
          requestHash: 'hash-001',
          responseStatus: HttpStatus.CREATED,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        await expect(
          queryRunner.manager.insert(IdempotencyKeyEntity, entity2),
        ).rejects.toThrow();

        try {
          await queryRunner.manager.save(entity2);
        } catch (error: any) {
          expect(error).toBeInstanceOf(QueryFailedError);
          expect(error.code).toBe('23505');
        }
      });

      it('createOrLock should throw QueryFailedError / HttpException when inserting duplicate idempotency key', async () => {
        // out side the createOrLock we start the transaction
        // simulate how the job of idempotency layer work
        const queryRunner: QueryRunner = request['queryRunner'];
        await queryRunner.startTransaction();
        const testKey = '4c59afab-754a-4c2c-8aef-7d2c84fea9ee';

        try {
          await idkService.createOrLock(testKey);
        } catch (error) {
          queryRunner.rollbackTransaction();
        }

        await expect(idkService.createOrLock(testKey)).rejects.toThrow();

        try {
          await idkService.createOrLock(testKey);
        } catch (error) {
          expect(error).toBeInstanceOf(HttpException);

          queryRunner.rollbackTransaction();
        }

        await queryRunner.commitTransaction();
      });
    });

    describe('Concurrency & Race Condition', () => {
      it('should safely handle concurrent calls to createOrLock - only ONE record should be created', async () => {
        const queryRunner: QueryRunner = request['queryRunner'];
        await queryRunner.connect();
        await queryRunner.startTransaction();

        const concurrentCalls = 10;
        const key = 'ddda1226-2910-4380-a84a-605c084e1068';

        const promises = Array(concurrentCalls)
          .fill(null)
          .map(async () => {
            try {
              return await idkService.createOrLock(key);
            } catch (error) {
              // Return the error object so Promise.all doesn't explode
              return error;
            }
          });

        const results = await Promise.all(promises);

        if (queryRunner.isTransactionActive) {
          await queryRunner.commitTransaction();
        }

        const successfulResults = results.filter(
          (r) => r && !(r instanceof Error),
        );
        const errors = results.filter(
          (r) => r instanceof Error || r instanceof HttpException,
        );

        expect(successfulResults.length).toBe(1);
        expect(successfulResults[0].key).toBe(key);
        expect(successfulResults[0].operation).toBe('processing');

        expect(errors.length).toBe(concurrentCalls - 1);

        // NOTE: Verify only one record exists in the table
        // happens in Interceptor
        // at this point: transaction work correctly
      });

      it('should safely handle concurrent calls - only ONE record is created', async () => {
        const queryRunner: QueryRunner = request['queryRunner'];
        await queryRunner.connect();
        await queryRunner.startTransaction();
        const testKey = 'ee4b0386-dcf1-4430-9614-e221ab136718';

        const CONCURRENT_REQUESTS = 8;

        const results = await Promise.allSettled(
          Array.from({ length: CONCURRENT_REQUESTS }, () =>
            idkService.createOrLock(testKey),
          ),
        );

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        console.log(
          `[Race Core] ${fulfilled.length} succeeded, ${rejected.length} rejected out of ${CONCURRENT_REQUESTS}`,
        );

        expect(fulfilled.length).toBe(1); // Chỉ duy nhất 1 request tạo thành công
        expect(rejected.length).toBe(CONCURRENT_REQUESTS - 1); // Các request còn lại phải bị từ chối
      });

      it('should return consistent error for all concurrent duplicate requests', async () => {
        const queryRunner: QueryRunner = request['queryRunner'];
        await queryRunner.connect();
        await queryRunner.startTransaction();

        const testKey = 'a9e4ce08-8ec2-4f7a-aaf5-d0e2df691de7';

        await idkService.createOrLock(testKey);

        const CONCURRENT_REQUESTS = 6;

        const results = await Promise.allSettled(
          Array.from({ length: CONCURRENT_REQUESTS }, () =>
            idkService.createOrLock(testKey),
          ),
        );

        const rejected = results.filter((r) => r.status === 'rejected');

        expect(rejected.length).toBe(CONCURRENT_REQUESTS);

        rejected.forEach((result) => {
          const error = result.reason;
          expect(error).toBeDefined();
          expect(error.status).toBe(409);
        });
      });
    });
  });

  describe('saveResponse', () => {
    it('should persist success status and response body into database', async () => {
      const testKey = 'b84bfc9c-9d45-43d7-8c7f-a91b16bd7edd';
      const mockResponse = {
        paymentReference: 'pay_abc123456',
        state: 'AUTHORIZED',
        amount: 500000,
        orderId: 'ORD-9999',
      };

      await idkRepository.insert({
        key: testKey,
        requestPath: '/payments/authorize',
        operation: 'processing',
        requestHash: 'hash123',
        expiresAt: new Date(Date.now() + 86400000),
      });

      const queryRunner: QueryRunner = request['queryRunner'];
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // 2. Gọi saveResponse
      await idkService.saveResponse(testKey, mockResponse);

      await queryRunner.commitTransaction();

      // 3. Kiểm tra thực tế trong database
      const savedRecord = await idkRepository.findOne({
        where: { key: testKey },
      });

      expect(savedRecord).not.toBeNull();
      expect(savedRecord!.operation).toBe('success');
      expect(savedRecord!.responseStatus).toBe(200);
      expect(savedRecord!.responseBody).toEqual(mockResponse);
      expect(savedRecord!.updateAt).toBeDefined(); // nếu bạn có cập nhật timestamp
    });

    it('should not update if record does not exist', async () => {
      const nonExistentKey = '9cb9099b-d020-4119-9177-55af6937e3c9';

      const queryRunner: QueryRunner = request['queryRunner'];
      await queryRunner.connect();
      await queryRunner.startTransaction();

      await idkService.saveResponse(nonExistentKey, { some: 'data' });

      const record = await idkRepository.findOne({
        where: { key: nonExistentKey },
      });
      expect(record).toBeNull(); // Không tạo mới record
    });

    it('should handle transaction correctly when saveResponse is called inside transaction', async () => {
      const testKey = '9cb9099b-d020-4119-9177-55af6937e3c9';

      const mockResponse = {
        paymentReference: 'pay_abc123456',
        state: 'AUTHORIZED',
        amount: 500000,
      };

      const queryRunner: QueryRunner = request['queryRunner'];
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.manager.insert(IdempotencyKeyEntity, {
          key: testKey,
          requestPath: '/payments/authorize',
          operation: 'processing',
          requestHash: 'hash-tx-001',
          expiresAt: new Date(Date.now() + 86400000),
        });

        const promises = Array(5)
          .fill(null)
          .map(() =>
            idkService.saveResponse(testKey, mockResponse).catch((err) => err),
          );

        const results = await Promise.all(promises);

        const errors = results.filter((r) => r instanceof Error);
        expect(errors.length).toBe(0);

        await queryRunner.commitTransaction();

        const savedRecord = await idkRepository.findOne({
          where: { key: testKey },
        });

        expect(savedRecord).not.toBeNull();
        expect(savedRecord!.operation).toBe('success');
        expect(savedRecord!.responseStatus).toBe(200);
        expect(savedRecord!.responseBody).toEqual(mockResponse);
      } catch (error) {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }
    });
  });
});
