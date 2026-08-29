// src/doll/guard.module.ts
import { Module } from '@nestjs/common';
import { GuardService } from './guard.service';

@Module({
  providers: [GuardService],
  exports: [GuardService], // 다른 서비스에서 쓸 수 있게 허용
})
export class GuardModule {}