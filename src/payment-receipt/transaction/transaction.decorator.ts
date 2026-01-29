import {
  createParamDecorator,
  ExecutionContext,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { QueryRunner } from 'typeorm';

export const Transaction = createParamDecorator(
  (data: unknown, context: ExecutionContext) => {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request & { queryRunner: QueryRunner }>>();

    if (!request.queryRunner) {
      throw new Error('QueryRunner not found: Interceptor not applied');
    }

    return request.queryRunner;
  },
);
