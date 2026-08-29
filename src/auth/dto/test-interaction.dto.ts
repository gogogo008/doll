import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class TestInteractionDto {
  @IsOptional() // 값이 없어도 에러 안 냄
  deviceId!: string;

  @Type(() => Number)
  @IsOptional()
  intensity!: number;

  @Type(() => Number)
  @IsOptional()
  changedCount!: number;
}