import {
  IsInt,
  IsString,
  IsNotEmpty,
  Min,
  Max,
  Length,
  Matches,
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

export class CreateAuthorizationMockBankRequestDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @Length(13, 19)
  @Matches(/^\d{13,19}$/)
  @IsLuhhValidated('cardNumber', { message: 'Card Number is invalid' })
  cardNumber!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 4)
  @IsNotEmpty({ message: 'CVV is required' })
  @Length(3, 4, { message: 'CVV must be between 3 and 4 digits' })
  cvv!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expiryMonth!: number;

  @IsInt()
  @Min(2024)
  @Max(2099)
  expiryYear!: number;
}
