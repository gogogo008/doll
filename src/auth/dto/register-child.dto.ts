// src/dto/register-child.dto.ts
import { IsString, IsNumber, IsOptional, IsNotEmpty } from 'class-validator';

export class RegisterChildDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @IsNotEmpty()
  age!: number;

  @IsString()
  @IsNotEmpty()
  gender!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string; // 인형의 고유 ID

  @IsString()
  @IsOptional() // 선택 사항(Optional)인 필드는 @IsOptional()을 명시해야 함!
  characteristics?: string;
}