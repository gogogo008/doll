// auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../entities/user.entity'; // 경로 확인 필요!
import * as bcrypt from 'bcrypt'; // bcrypt는 이렇게 가져와야 합니다.
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  // 회원가입
  async signup(userData: any) {
    const { email, password, name, phoneNumber, role } = userData;

    // 1. 비밀번호 암호화 (Salt)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 2. 유저 생성 및 저장
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      name,
      phoneNumber,
      role,
    });

    await this.userRepository.save(user);
    return { message: '회원가입 성공' };
  }

  // 로그인
  async login(email: string, pass: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    // 1. 유저 존재 여부 및 비밀번호 확인
    if (user && (await bcrypt.compare(pass, user.password))) {
      // 2. JWT 토큰에 담을 내용 (Payload)
      const payload = { email: user.email, sub: user.id, role: user.role };
      
      // 3. 프론트엔드가 요구한 형식대로 반환
      return {
        accessToken: this.jwtService.sign(payload),
        role: user.role,
        name: user.name,
      };
    }
    throw new UnauthorizedException('로그인 정보가 일치하지 않습니다.');
  }
}