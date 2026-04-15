import {
  ValidateNested,
  IsCreditCard,
  IsNotEmptyObject,
  IsInt,
  IsNumber,
  IsPositive,
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

export class CheckoutRequestDto {
  @IsString()
  orderId!: string;

  @IsString()
  customerId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsNotEmptyObject()
  @ValidateNested()
  cardInfo: RawCardDto;
}

class RawCardDto {
  @IsCreditCard()
  @IsLuhhValidated('cardNumber', { message: 'Card Number is invalid' })
  cardNumber!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expiryMonth!: number;

  @IsInt()
  @Min(2024)
  @Max(2099)
  expiryYear!: number;

  @IsString()
  @Length(3, 4)
  cvv: string;
}
