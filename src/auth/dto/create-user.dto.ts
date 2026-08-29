import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email!: string;

  @IsString()
  @MinLength(4, { message: '비밀번호는 최소 4자 이상이어야 합니다.' })
  password!: string;

  @IsString()
  name!: string;

  @IsString()
  phoneNumber!: string;

  @IsString()
  role!: string; // 'PARENT' | 'TEACHER'
}