import { Request } from 'express';
import { HttpException, HttpStatus, RawBodyRequest } from '@nestjs/common';
import { createHash } from 'crypto';
import { IdempotencyKey } from '../entity/idempotency-keys.entity';

export const computeRequestFingerprint = (request: RawBodyRequest<Request>) => {
  const hash = createHash('sha256');

  const method = (request.method || 'POST').toUpperCase();
  const path = request.path || '';

  hash.update(method);
  hash.update('\0');
  hash.update(path);
  hash.update('\0');

  const rawBody = request.rawBody;
  if (Buffer.isBuffer(rawBody)) {
    hash.update(rawBody);
  } else {
    // should have log warning
    hash.update(''); // fallback empty
  }

  const fingerprint = hash.digest('hex');
  return fingerprint;
};

export const compareHash = (
  request: RawBodyRequest<Request>,
  existingIdempotencyEntity: IdempotencyKey,
) => {
  const currentPayloadHash = computeRequestFingerprint(request);

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
};
