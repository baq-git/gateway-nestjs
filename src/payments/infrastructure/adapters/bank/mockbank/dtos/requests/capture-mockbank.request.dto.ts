import { IsInt, IsString, IsNotEmpty, Min, Matches } from 'class-validator';

export class CreateCaptureMockBankRequestDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^auth_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  )
  authorizationId!: string;
}
