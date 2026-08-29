import { Controller, Post } from '@nestjs/common';
import { DollService } from './doll.service';

@Controller('doll')
export class DollController {
  constructor(private readonly dollService: DollService) {}

  /**
   * [배치/관리자 API] 기존 DB 데이터 전체 임베딩 마이그레이션
   */
  @Post('migrate-embeddings')
  async runMigration() {
    console.log('임베딩 작업을 시작합니다...');
    
    // 비동기 백그라운드 작업 실행
    this.dollService.embedAllExistingInteractions();
    
    return { 
      success: true, 
      message: "임베딩 작업이 백그라운드에서 시작되었습니다. 터미널 로그를 확인하세요." 
    };
  }
}