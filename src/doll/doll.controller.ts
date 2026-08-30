import { Controller, Post } from '@nestjs/common';
import { DollService } from './doll.service';

@Controller('doll')
export class DollController {
  constructor(private readonly dollService: DollService) {}

  /**
   * [배치/관리자 API] 기존 DB 데이터 전체 임베딩 마이그레이션
   */

}