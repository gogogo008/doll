// src/auth/guard/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // 1. 헤더의 Bearer 토큰에서 JWT를 추출합니다.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // 2. AuthModule에서 설정했던 시크릿 키와 동일해야 합니다.
      secretOrKey: 'MY_SUPER_SECRET_KEY', 
    });
  }

  // 토큰 검증이 성공하면 호출됩니다. 여기서 리턴한 값이 req.user에 들어갑니다.
  async validate(payload: any) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}