// auth.controller.ts
import { Controller, Post, Body } from '@nestjs/common'; // 1. NestJS 핵심 데코레이터들
import { AuthService } from './auth.service'; // 2. 방금 만든 서비스 클래스
import { CreateUserDto } from './dto/create-user.dto';
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  async signup(@Body() createUserDto: CreateUserDto) {
    return this.authService.signup(createUserDto);
  }

  @Post('login')
  async login(@Body() loginDto: any) {
    return this.authService.login(loginDto.email, loginDto.password);
  }
}