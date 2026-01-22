import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsString,
  Length,
  Max,
  Min,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

function luhnChecksum(code: string) {
  const arr = `${code}`
    .replace(/\D/g, '')
    .split('')
    .reverse()
    .map((x) => Number.parseInt(x));

  const lastDigit = arr.shift();
  let sum = arr.reduce(
    (acc, val, i) =>
      i % 2 !== 0 ? acc + val : acc + ((val *= 2) > 9 ? val - 9 : val),
    0,
  );
  if (lastDigit) sum += lastDigit;

  return sum % 10 === 0;
}

export function IsLuhhValidated(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidCardNumber',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: string, _) {
          if (!value) return false;
          if (value.length !== 16) return false;
          if (/[^0-9-\s]+/.test(value)) return false;

          return luhnChecksum(value);
        },
      },
    });
  };
}

export class CreateAuthorizePaymentRequestDto {
  @IsNotEmpty({ message: 'Amount is required' })
  @IsNumber()
  @Min(1, { message: 'Amount must be greater than 0' })
  @Max(9999, { message: 'Amount must be less than 9999' })
  amount!: number;

  @IsNotEmpty({ message: 'Card Number is required' })
  @Length(13, 19, { message: 'Card Number must be between 13 and 19 digits' })
  @IsLuhhValidated('cardNumber', { message: 'Card Number is invalid' })
  @IsString({ message: 'Card Number must be a string' })
  cardNumber!: string;

  @IsNotEmpty({ message: 'CVV is required' })
  @Length(3, 4, { message: 'CVV must be between 3 and 4 digits' })
  @IsNumberString()
  cvv!: string;

  @IsNotEmpty({ message: 'Expiry Month is required' })
  @IsInt({ message: 'Expiry Month must be an integer' })
  @Min(1, { message: 'Expiry Month must be greater than 0' })
  @Max(12, { message: 'Expiry Month must be less than 12' })
  expiryMonth!: number;

  @IsNotEmpty({ message: 'Expiry Year is required' })
  @IsInt({ message: 'Expiry Year must be an integer' })
  @Min(2024, { message: 'Expiry Year must be greater than 2024' })
  @Max(2099, { message: 'Expiry Year must be less than 2099' })
  expiryYear!: number;
}

export class CreateAuthorizePaymentResponseDto {
  amount!: number;
  authorizationId!: string;
  createdAt!: Date;
  currency!: string;
  expiresAt!: Date;
  status!: string;
}

export class GetAuthorizePaymentResponseDto {
  amount!: number;
  authorization_id!: string;
  createdAt!: Date;
  currency!: string;
  expiresAt!: Date;
  status: 'approved';
}
