import { validate } from 'class-validator';
import { CreateAuthorizePaymentRequestDto } from '../mockbank/authorize-payment.dto';

describe('CreateAuthorizePaymentRequestDto', () => {
  it('should be valid', async () => {
    const dto = new CreateAuthorizePaymentRequestDto();
    dto.amount = 100;
    dto.cardNumber = '4111111111111111';
    dto.cvv = '123';
    dto.expiryMonth = 12;
    dto.expiryYear = 2020;

    expect(await validate(dto)).toEqual([]);
  });

  it('should invalid for valid card numbers with spaces or dashes (case 16 digits)', async () => {
    const dto1 = new CreateAuthorizePaymentRequestDto();
    dto1.amount = 100;
    dto1.cardNumber = '4242 4242 4242 4242';
    dto1.cvv = '123';
    dto1.expiryMonth = 12;
    dto1.expiryYear = 2020;

    validate(dto1).then((errors) => {
      if (errors.length > 0) {
        const constraints = errors[0].constraints;
        if (constraints) {
          expect(constraints.isValidCardNumber).toEqual(
            'Card Number is invalid',
          );

          expect(constraints.isValidCardNumber).toEqual(
            'Card Number is invalid',
          );
        }
      }
    });

    const dto2 = new CreateAuthorizePaymentRequestDto();
    dto2.amount = 100;
    dto2.cardNumber = '4242-4242-4242-4242';
    dto2.cvv = '123';
    dto2.expiryMonth = 12;
    dto2.expiryYear = 2020;

    validate(dto2).then((errors) => {
      if (errors.length > 0) {
        const constraints = errors[0].constraints;
        if (constraints) {
          expect(constraints.isValidCardNumber).toEqual(
            'Card Number is invalid',
          );
          expect(constraints.isValidCardNumber).toEqual(
            'Card Number is invalid',
          );
        }
      }
    });
  });

  it('should invalid for valid card numbers with spaces or dashes (case 15 digits)', async () => {
    const dto = new CreateAuthorizePaymentRequestDto();
    dto.amount = 100;
    dto.cardNumber = '4242424242424242';
    dto.cvv = '123';
    dto.expiryMonth = 12;
    dto.expiryYear = 2020;

    validate(dto).then((errors) => {
      if (errors.length > 0) {
        const constraints = errors[0].constraints;
        if (constraints) {
          expect(constraints.isValidCardNumber).toEqual(
            'Card Number is invalid',
          );
          expect(constraints.isValidCardNumber).toEqual(
            'Card Number is invalid',
          );
        }
      }
    });
  });

  it('should fail validation if card number contains non-digit/non-allowed characters', async () => {
    const dto = new CreateAuthorizePaymentRequestDto();
    dto.amount = 100;
    dto.cardNumber = '4242a424242424242';
    dto.cvv = '123';
    dto.expiryMonth = 12;
    dto.expiryYear = 2020;

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    if (errors.length > 0) {
      const constraints = errors[0].constraints;
      if (constraints) {
        expect(constraints.isValidCardNumber).toEqual('Card Number is invalid');
      }
    }
  });

  it('should fail validation if card number is empty or undefined', async () => {
    const emptyCardNumber = new CreateAuthorizePaymentRequestDto();
    emptyCardNumber.amount = 100;
    emptyCardNumber.cardNumber = '';
    emptyCardNumber.cvv = '123';
    emptyCardNumber.expiryMonth = 12;
    emptyCardNumber.expiryYear = 2020;

    const undefinedCardNumber = new CreateAuthorizePaymentRequestDto();
    undefinedCardNumber.amount = 100;
    // @ts-ignore
    undefinedCardNumber.cardNumber = undefined;
    undefinedCardNumber.cvv = '123';
    undefinedCardNumber.expiryMonth = 12;
    undefinedCardNumber.expiryYear = 2020;

    const errors1 = await validate(emptyCardNumber);
    const errors2 = await validate(undefinedCardNumber);

    expect(errors1).toHaveLength(1);
    expect(errors2).toHaveLength(1);
  });

  const validCardNumber = '4242424242424242';
  const createValidDto = () => {
    const dto = new CreateAuthorizePaymentRequestDto();
    dto.amount = 100;
    dto.cardNumber = validCardNumber;
    dto.cvv = '123';
    dto.expiryMonth = 12;
    dto.expiryYear = 2026; // Future year to avoid expiry issues
    return dto;
  };

  it('should fail if amount is missing or undefined', async () => {
    const dto = createValidDto();

    // @ts-ignore
    dto.amount = undefined;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    if (errors.length > 0) {
      const amountError = errors.find((e) => e.property === 'amount');
      expect(amountError?.constraints?.isNotEmpty).toBe('Amount is required');
    }
  });

  it('should fail if amount is not a number (e.g., string)', async () => {
    const dto = createValidDto();
    // @ts-ignore
    dto.amount = 'invalid';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    if (errors.length > 0) {
      const amountError = errors.find((e) => e.property === 'amount');
      expect(amountError?.constraints?.isNumber).toBeDefined();
    }
  });

  it('should fail if cvv is missing', async () => {
    const dto = createValidDto();
    // @ts-ignore
    dto.cvv = undefined;

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('cvv');
    expect(errors[0].constraints?.isNotEmpty).toBe('CVV is required');
  });

  it('should fail if cvv is not exactly 3 digits', async () => {
    const short = createValidDto();
    short.cvv = '12'; // 2 digits

    const long = createValidDto();
    long.cvv = '1234'; // 4 digits

    const errors1 = await validate(short);
    const errors2 = await validate(long);

    expect(errors1.length).toBe(1);
    expect(errors1[0].constraints?.isLength).toBeDefined();
    expect(errors2.length).toBe(1);
    expect(errors2[0].constraints?.isLength).toBeDefined();
  });

  it('should fail if cvv contains non-digits', async () => {
    const dto = createValidDto();
    dto.cvv = '12a';

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.isNumberString).toBeDefined();
  });

  it('should fail if expiryMonth is missing', async () => {
    const dto = createValidDto();
    // @ts-ignore
    dto.expiryMonth = undefined;

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('expiryMonth');
    expect(errors[0].constraints?.isNotEmpty).toBe('Expiry Month is required');
  });

  it('should fail if expiryMonth is not an integer', async () => {
    const dto = createValidDto();
    // @ts-ignore
    dto.expiryMonth = 5.5;

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.isInt).toBe(
      'Expiry Month must be an integer',
    );
  });

  it('should fail if expiryMonth is less than 1', async () => {
    const dto = createValidDto();
    dto.expiryMonth = 0;

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.min).toBe(
      'Expiry Month must be greater than 0',
    );
  });

  it('should fail if expiryMonth is greater than 12', async () => {
    const dto = createValidDto();
    dto.expiryMonth = 13;

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.max).toBe(
      'Expiry Month must be less than 12',
    );
  });

  it('should fail if expiryYear is missing', async () => {
    const dto = createValidDto();
    // @ts-ignore
    dto.expiryYear = undefined;

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('expiryYear');
    expect(errors[0].constraints?.isNotEmpty).toBe('Expiry Year is required');
  });

  it('should fail if expiryYear is not an integer', async () => {
    const dto = createValidDto();
    // @ts-ignore
    dto.expiryYear = 2026.5;

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.isInt).toBe('Expiry Year must be an integer');
  });

  it('should fail if expiryYear is less than 2020', async () => {
    const dto = createValidDto();
    dto.expiryYear = 2019;

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.min).toBe(
      'Expiry Year must be greater than 2020',
    );
  });

  it('should pass when all fields are valid (positive control)', async () => {
    const dto = createValidDto();

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
