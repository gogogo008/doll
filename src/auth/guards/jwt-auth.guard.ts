import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Reflector를 주입받아야 합니다.
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // 1. 해당 핸들러(메서드)나 클래스에 'isPublic' 메타데이터가 있는지 확인
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    // 2. 만약 Public이라면 인증 검사를 생략(true 반환)
    if (isPublic) {
      return true;
    }

    // 3. Public이 아니라면 기존의 JWT 인증 로직(AuthGuard)을 실행
    return super.canActivate(context);
  }
}