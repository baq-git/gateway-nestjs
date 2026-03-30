import { TestingModule, Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { QueryRunner, Repository } from 'typeorm';
import { IdempotencyService } from '../idempotency.service';
import { IdempotencyKeyEntity } from '@domain/entities/idempotency-keys.entity';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PaymentEntity } from '@payments/domain/entities/payment.entity';

describe('IdempotencyService', () => {
  let idkService: IdempotencyService;
  let mockIdkRepository: DeepMocked<Repository<IdempotencyKeyEntity>>;
  let mockQueryRunner: DeepMocked<QueryRunner>;

  beforeEach(async () => {
    mockIdkRepository = createMock<Repository<IdempotencyKeyEntity>>();
    mockQueryRunner = createMock<QueryRunner>();

    const mockRequest = {
      path: '/payments/authorize',
      ['queryRunner']: mockQueryRunner,
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: getRepositoryToken(IdempotencyKeyEntity),
          useValue: mockIdkRepository,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    idkService = await module.resolve<IdempotencyService>(IdempotencyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(idkService).toBeDefined();
    expect(mockIdkRepository).toBeDefined();
  });

  describe('findByKey', () => {
    const mockKey = '4d61db33-fde8-4e35-846b-dd4adff9fc91';

    const mockProcessingKey: IdempotencyKeyEntity = {
      key: mockKey,
      operation: 'processing',
      requestPath: '/v1/payments',
      requestHash: 'sha256-hash-of-request-body',
      payment: { id: 'payment-123' } as PaymentEntity,
      createdAt: new Date(),
      updateAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h later
    };

    const mockSuccessKey: IdempotencyKeyEntity = {
      key: mockKey,
      operation: 'success',
      requestPath: '/v1/payments',
      requestHash: 'sha256-hash-of-request-body',
      payment: {
        id: 'payment-456',
        amount: 1000,
        currency: 'USD',
      } as PaymentEntity,
      responseStatus: 201,
      responseBody: {
        statusCode: 201,
        message: 'Payment processed successfully',
        data: { id: 'payment-456' } as PaymentEntity,
      },
      createdAt: new Date(Date.now()),
      updateAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    };

    const mockFailedKey: IdempotencyKeyEntity = {
      key: mockKey,
      operation: 'failure',
      requestPath: '/v1/payments',
      requestHash: 'sha256-hash-of-request-body',
      payment: {} as PaymentEntity,
      responseStatus: 400,
      responseBody: new HttpException(
        'Insufficent Funds',
        HttpStatus.BAD_REQUEST,
      ),
      createdAt: new Date(),
      updateAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    };

    it('should return null when key does not exist', async () => {
      mockIdkRepository.findOne.mockResolvedValue(null);
      const result = await idkService.findByKey(mockKey);
      expect(result).toBeNull();
      expect(mockIdkRepository.findOne).toHaveBeenCalledWith({
        where: {
          key: mockKey,
        },
      });
    });

    it('should return record when key exists with success operation', async () => {
      mockIdkRepository.findOne.mockResolvedValue(mockSuccessKey);
      const result = await idkService.findByKey(mockKey);
      expect(mockIdkRepository.findOne).toHaveBeenCalledWith({
        where: {
          key: mockKey,
        },
      });
      expect(result).not.toBeNull();
      expect(result?.operation).toBe('success');
      expect(result?.responseBody).toEqual({
        statusCode: 201,
        message: 'Payment processed successfully',
        data: { id: 'payment-456' } as PaymentEntity,
      });

      expect(result).toEqual(mockSuccessKey);
    });

    it('should return record when key exists with processing operation', async () => {
      mockIdkRepository.findOne.mockResolvedValue(mockProcessingKey);
      const result = await idkService.findByKey(mockKey);
      expect(result).toEqual(mockProcessingKey);
      expect(result?.operation).toBe('processing');
    });

    it('should return record when key exists with failure operation', async () => {
      mockIdkRepository.findOne.mockResolvedValue(mockFailedKey);
      const result = await idkService.findByKey(mockKey);
      expect(result).toEqual(mockFailedKey);
      expect(result?.operation).toBe('failure');
    });

    it('should call repository exactly once', async () => {
      mockIdkRepository.findOne.mockResolvedValue(null);
      await idkService.findByKey(mockKey);
      expect(mockIdkRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should call repository exactly once', async () => {
      mockIdkRepository.findOne.mockResolvedValue(null);

      await idkService.findByKey(mockKey);

      expect(mockIdkRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException when key is empty', async () => {
      await expect(idkService.findByKey('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(idkService.findByKey('   ')).rejects.toThrow(
        BadRequestException,
      );
      await expect(idkService.findByKey(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    describe('createOrLock', () => {
      const mockKey = '15dc2e9d-c29f-46d0-a4f7-0a45614e00a8';

      it('should create new record with processing operation', async () => {
        mockQueryRunner.manager.createQueryBuilder.mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
          insert: jest.fn().mockReturnThis(),
          into: jest.fn().mockReturnThis(),
          values: jest.fn().mockReturnThis(),
          returning: jest.fn().mockReturnThis(), // <--- ADD THIS LINE
          execute: jest.fn().mockResolvedValue({
            generatedMaps: [{ key: mockKey, operation: 'processing' }],
          }),
        } as any);

        const mockCreatedEntity = {
          id: 1,
          key: mockKey,
          operation: 'processing',
        } as any;

        mockIdkRepository.findOne.mockResolvedValue(mockCreatedEntity);
        mockQueryRunner.manager.create.mockReturnValue(mockCreatedEntity);
        mockQueryRunner.manager.insert.mockResolvedValue({
          identifiers: [{ key: mockKey }], // Phải có cái này vì code bạn dùng result.identifiers[0].key
        } as any);

        const result = await idkService.createOrLock(mockKey);

        expect(result).toBeDefined();
        expect(mockQueryRunner.manager.create).toHaveBeenCalled();

        expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
          IdempotencyKeyEntity,
          expect.objectContaining({
            key: mockKey,
            operation: 'processing',
          }),
        );

        expect(mockQueryRunner.manager.createQueryBuilder).toHaveBeenCalled();
        expect(
          mockQueryRunner.manager.createQueryBuilder().insert,
        ).toHaveBeenCalled();
        expect(
          mockQueryRunner.manager.createQueryBuilder().insert,
        ).toHaveBeenCalled();
        expect(result?.operation).toBe('processing');

        const qb = mockQueryRunner.manager.createQueryBuilder();

        expect(mockQueryRunner.manager.createQueryBuilder).toHaveBeenCalled();

        expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
        expect(qb.insert().into).toHaveBeenCalledWith(IdempotencyKeyEntity);
        expect(qb.execute).toHaveBeenCalled();
      });

      it('should return existing record with processing operation when key already exists (with pessimistic lock)', async () => {
        const mockExistingEntity = {
          key: mockKey,
          operation: 'processing',
        } as IdempotencyKeyEntity;

        mockQueryRunner.manager.createQueryBuilder.mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockExistingEntity),
        } as any);

        try {
          await idkService.createOrLock(mockKey);
        } catch (error) {
          expect(error).toBeInstanceOf(HttpException);
        }
      });

      it('should return existing record with failure operation when key already exists (with pessimistic lock)', async () => {
        const mockExistingEntity = {
          key: mockKey,
          operation: 'success',
        } as IdempotencyKeyEntity;

        mockQueryRunner.manager.createQueryBuilder.mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(mockExistingEntity),
        } as any);

        try {
          await idkService.createOrLock(mockKey);
        } catch (error) {
          expect(error).toBeInstanceOf(ConflictException);
        }
      });
    });
  });

  describe('saveResponse', () => {});
});
