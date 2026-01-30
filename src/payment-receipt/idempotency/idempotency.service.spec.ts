import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from '../entity/idempotency-keys.entity';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { DataSource, Repository } from 'typeorm';
import { PaymentReceipt } from '../entity/payment-receipt.entity';
import { compareHash, computeRequestFingerprint } from '../utils/requestHash';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repository: Repository<IdempotencyKey>;
  let dataSource: DataSource;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
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
    // findOneByKey: trả về entity khi có, null khi không
    // insertIdempotencyEntity: insert thành công, trả entity
    // insertIdempotencyEntity khi đã tồn tại: không insert thêm, trả entity cũ + check hash
    // updateToSuccessIdempotency: cập nhật operation = 'success', lưu responseBody
    // updateToFailureIdempotency: cập nhật operation = 'failure', lưu error
  });
});
