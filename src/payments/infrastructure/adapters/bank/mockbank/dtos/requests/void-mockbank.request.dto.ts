import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateVoidRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^auth_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  )
  authorizationId!: string;
}
