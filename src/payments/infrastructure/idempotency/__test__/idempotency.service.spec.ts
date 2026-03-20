import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { IdempotencyKey } from '@domain/entities/idempotency-keys.entity';
import { PaymentReceipt } from '@domain/entities/payment.entity';
import { PaymentReceiptResponseSuccessDto } from '@presentation/dtos/responses/payments.dto';
import {
  computeRequestFingerprint,
  compareHash,
} from '@shared/utils/requestHash';
import { IdempotencyService } from '../idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repository: Repository<IdempotencyKey>;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          database: 'paymentgatewaytest',
          username: 'postgres',
          password: 'postgres',
          retryAttempts: 0,
          entities: [IdempotencyKey, PaymentReceipt],
          synchronize: true,
          dropSchema: true,
        }),
        TypeOrmModule.forFeature([IdempotencyKey]),
      ],
      providers: [IdempotencyService],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    repository = module.get<Repository<IdempotencyKey>>(
      getRepositoryToken(IdempotencyKey),
    );
    dataSource = module.get<DataSource>(DataSource);
    queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();
  }, 15000);

  afterEach(async () => {
    if (queryRunner && !queryRunner.isReleased) {
      try {
        await queryRunner.rollbackTransaction().catch(() => {});
        await queryRunner.release().catch(() => {});
      } catch (e) {
        console.warn('Cleanup queryRunner failed:', e);
      }
    }

    await repository.clear().catch(() => {});
  });

  it('should be defined', async () => {
    expect(service).toBeDefined();
    expect(repository).toBeDefined();
    expect(dataSource).toBeDefined();
  });

  describe('Fingerprint / Request Hash', () => {
    describe('Compute request fingerprint', () => {
      it('should compute fingerprint with same hash', () => {
        const request = {
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from('test'),
        } as RawBodyRequest<Request>;

        const fingerprint1 = computeRequestFingerprint(request);
        const fingerprint2 = computeRequestFingerprint(request);

        expect(fingerprint1).toMatch(/^[0-9a-f]{64}$/);
        expect(fingerprint2).toMatch(/^[0-9a-f]{64}$/);
        expect(fingerprint1).toBe(fingerprint2);
      });

      it('should compute fingerprint with different hash', () => {
        const mainRequest = {
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from('test'),
        } as RawBodyRequest<Request>;

        const requestWithDifferentBody = {
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from('test2'),
        } as RawBodyRequest<Request>;

        const requestWithDifferentPath = {
          method: 'POST',
          path: '/api/v1/authorization',
          rawBody: Buffer.from('test'),
        } as RawBodyRequest<Request>;

        const requestWithDifferentMethod = {
          method: 'GET',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from('test'),
        } as RawBodyRequest<Request>;

        const fingerprint1 = computeRequestFingerprint(mainRequest);
        const fingerprint2 = computeRequestFingerprint(
          requestWithDifferentBody,
        );
        const fingerprint3 = computeRequestFingerprint(
          requestWithDifferentPath,
        );
        const fingerprint4 = computeRequestFingerprint(
          requestWithDifferentMethod,
        );

        expect(fingerprint1).toMatch(/^[0-9a-f]{64}$/);
        expect(fingerprint2).toMatch(/^[0-9a-f]{64}$/);
        expect(fingerprint3).toMatch(/^[0-9a-f]{64}$/);
        expect(fingerprint4).toMatch(/^[0-9a-f]{64}$/);
        expect(fingerprint1).not.toBe(fingerprint2);
        expect(fingerprint1).not.toBe(fingerprint3);
        expect(fingerprint1).not.toBe(fingerprint4);
        expect(fingerprint2).not.toBe(fingerprint3);
        expect(fingerprint2).not.toBe(fingerprint4);
        expect(fingerprint3).not.toBe(fingerprint4);
      });

      it('should fallback empty string if rawBody not a buffer', () => {
        const request1 = {
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: 'string',
        } as any;

        const request2 = {
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from(''),
        } as RawBodyRequest<Request>;

        const fingerprint1 = computeRequestFingerprint(request1);
        const fingerprint2 = computeRequestFingerprint(request2);

        expect(fingerprint1).toBe(fingerprint2);
      });

      it('should be determic hash', () => {
        const request = {
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from('test'),
        } as RawBodyRequest<Request>;

        const fingerprint1 = computeRequestFingerprint(request);
        const fingerprint2 = computeRequestFingerprint(request);
        const fingerprint3 = computeRequestFingerprint(request);

        expect(fingerprint1).toBe(fingerprint2);
        expect(fingerprint1).toBe(fingerprint3);
        expect(fingerprint2).toBe(fingerprint3);
      });
    });

    describe('Compare request hash', () => {
      it('should throw error if request hash not match', () => {
        const request = {
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from('test'),
        } as RawBodyRequest<Request>;

        const existingIdempotencyEntity = {
          key: 'idempotency-key',
          requestHash: 'different-hash',
        } as IdempotencyKey;

        expect(() => compareHash(request, existingIdempotencyEntity)).toThrow(
          'Bad Request: Idempotency-Key reused with different payload',
        );
      });
    });
  });

  describe('IdempotencyService methods', () => {
    describe('insertIdempotencyEntity', () => {
      const createRequest = () =>
        ({
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from('test'),
          queryRunner,
        }) as RawBodyRequest<Request & { queryRunner: QueryRunner }>;

      it('should insert entity', async () => {
        const idk = '688a484e-e179-43f2-a5e0-ddafaecff925';
        const request = createRequest();

        const result = await service.insertIdempotencyEntity(request, idk);

        expect(result.inserted).toBe(true);
        expect(result.entity).toBeDefined();
        expect(result.entity.key).toBe(idk);
        expect(result.entity.operation).toBe('processing');
        expect(result.entity.requestHash).toBeTruthy();
      });

      it('should return exsiting entity if key exists and check hash', async () => {
        const request1 = createRequest();
        const request2 = createRequest();
        const idk = '688a484e-e179-43f2-a5e0-ddafaecff925';

        const result1 = await service.insertIdempotencyEntity(request1, idk);
        const result2 = await service.insertIdempotencyEntity(request2, idk);

        expect(result1.inserted).toBe(true);
        expect(result2.alreadyExists).toBe(true);
        expect(result2.entity.requestHash).toBe(result1.entity.requestHash);
        expect(result2.entity.operation).toBe('processing');
      });
    });

    describe('findOneBykey', () => {
      it('should return null if idempotency key not found', async () => {
        const idk = '688a484e-e179-43f2-a5e0-ddafaecff925';
        const result = await service.findOneByKey(idk, queryRunner);

        expect(result).toBeNull();
      });

      it('should return entity if idempotency key found', async () => {
        const idk = '688a484e-e179-43f2-a5e0-ddafaecff925';
        const request = {
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from('test'),
          queryRunner,
        } as RawBodyRequest<Request & { queryRunner: QueryRunner }>;

        const result = await service.insertIdempotencyEntity(request, idk);
        const result2 = await service.findOneByKey(
          result.entity.key,
          queryRunner,
        );

        expect(result2).toBeDefined();
        expect(result2).not.toBeNull();
        expect(result2?.key).toBe(idk);
        expect(result2?.operation).toBe('processing');
        expect(result2?.requestHash).toBeTruthy();
      });
    });

    describe('updateToSuccessIdempotency', () => {
      it('should update entity to success when entity is exists', async () => {
        const idk = '688a484e-e179-43f2-a5e0-ddafaecff925';
        const request = {
          method: 'POST',
          path: '/api/v1/authorizations',
          rawBody: Buffer.from('test'),
          queryRunner,
        } as RawBodyRequest<Request & { queryRunner: QueryRunner }>;

        const insertedResult = await service.insertIdempotencyEntity(
          request,
          idk,
        );

        const resultDto: PaymentReceiptResponseSuccessDto = {
          statusCode: 200,
          message: 'success',
          data: {
            key: insertedResult.entity.key,
            amount: 100,
            currency: 'VND',
            paymentMethod: 'card',
            status: 'success',
            createdAt: new Date(),
          },
        };

        const result = await service.updateToSuccessIdempotency(
          idk,
          resultDto,
          queryRunner,
        );

        expect(result.statusText).toBe(
          'Idempotency Entity operation update to success successfully',
        );
        expect(result.operation).toBe('success');
        expect(result.data.responseStatus).toBe(200);
        expect(result.data.key).toBe(idk);
      });

      it("should throw NOT_FOUND error when entity doesn't exists", async () => {
        const idk = '688a484e-e179-43f2-a5-ddafaecff925';

        const result = service.updateToSuccessIdempotency(
          idk,
          {
            statusCode: 200,
            message: 'success',
            data: {
              key: idk,
              amount: 100,
              currency: 'VND',
              paymentMethod: 'card',
              status: 'success',
              createdAt: new Date(),
            },
          },
          queryRunner,
        );

        await expect(result).rejects.toThrow('Idempotency Entity not found');
      });

      it('should throw PessimisticLockTransactionRequiredError when no transaction is open', async () => {
        const idk = '688a484e-e179-43f2-a5-ddafaecff925';

        // Tạo queryRunner mới, KHÔNG start transaction
        const noTxQueryRunner = dataSource.createQueryRunner();
        await noTxQueryRunner.connect();
        // Không gọi startTransaction() → không có transaction

        const mockResult = {
          statusCode: 201,
          message: 'Success',
          data: { id: 'payment-123' },
        };

        await expect(
          service.updateToSuccessIdempotency(idk, mockResult, noTxQueryRunner),
        ).rejects.toThrow(
          'An open transaction is required for pessimistic lock.',
        );

        await noTxQueryRunner.release();
      });

      it.only('should use pessimistic_write lock when updateToSuccessIdempotency', async () => {});
    });

    describe.skip('deleteByKey', () => {
      // TODO:
      // it contain relationship, we need to defined what to do when delete
      // whether delete the relationship or should be set deletedAt or something
      // only delete when expiredtime is less than now
    });

    // findOneByKey: trả về entity khi có, null khi không
    // insertIdempotencyEntity: insert thành công, trả entity
    // insertIdempotencyEntity khi đã tồn tại: không insert thêm, trả entity cũ + check hash
    // updateToSuccessIdempotency: cập nhật operation = 'success', lưu responseBody
    // updateToFailureIdempotency: cập nhật operation = 'failure', lưu error
  });
});
