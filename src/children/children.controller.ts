// children.controller.ts
import { Controller, Get, Post, Body, Req, UseGuards, Query, Param,Patch,Delete } from '@nestjs/common';
import { ChildrenService } from './children.service';
import { RegisterChildDto } from '../auth/dto/register-child.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'; 
import { User } from '../entities/user.entity';
import { UpdateChildSettingsDto } from 'src/auth/dto/update-child-settings.dto';
import { TestInteractionDto } from '../auth/dto/test-interaction.dto';
import { Public } from '../auth/decorators/public.decorator'; // 경로 확인 필수!
@Controller('children')
@UseGuards(JwtAuthGuard) // JWT 인증이 된 사용자만 접근 가능
export class ChildrenController {
  constructor(private readonly childrenService: ChildrenService) {}

  // GET http://localhost:3000/children
  @Get()
  async getMyChildren(@Req() req) {
    // 유저 정보를 JWT 토큰에서 가져옴 (req.user)
    return this.childrenService.findByUser(req.user.id);
  }
  @Public()
  @Post(':childId/parent-message')
  async sendParentMessage(
    @Param('childId') childId: number,
    @Body('message') message: string, // 또는 DTO를 만들어 @Body() dto: SendMessageDto
  ) {
    return await this.childrenService.sendParentMessage(Number(childId), message);
  }

  // POST http://localhost:3000/children/register
  @Post('register')
  async register(@Body() dto: RegisterChildDto, @Req() req) {
    return this.childrenService.register(dto, req.user);
  }

  @Get(':childId/interactions')
async getInteractionsByDate(
  @Param('childId') childId: number,
  @Query('date') date: string, // '2026-04-12' 형식으로 받을 예정
  @Req() req
) {
  // 본인의 아이인지 검증하는 로직이 서비스에 포함되면 더 안전
  return this.childrenService.findInteractionsByDate(childId, date);
  }

@Patch(':id/settings') // 예: PATCH /children/3/settings
async updateSettings(
  @Param('id') childId: number,
  @Body() dto: UpdateChildSettingsDto,
) {
  console.log(`🔥 [PATCH] /children/${childId}/settings 요청 들어옴!`, dto);
  const result = await this.childrenService.updateSettings(childId, dto);
  console.log('✅ 업데이트 완료된 결과:', result);
  return result;
}
// 6. 주간 통계 조회 API
  @Get(':childId/statistics/week')
  async getWeeklyStatistics(@Param('childId') childId: number) {
    return await this.childrenService.getWeeklyStatistics(+childId);
  }

@Get(':childId/statistics/month')
  async getMonthlyStatistics(
    @Param('childId') childId: number,
    @Query('year') year?: number,
    @Query('month') month?: number,
  ) {
    const now = new Date();
    const targetYear = year ? Number(year) : now.getFullYear();
    const targetMonth = month ? Number(month) : now.getMonth() + 1;

    return await this.childrenService.getMonthlyStatistics(+childId, targetYear, targetMonth);
  }
  @Patch(':id/device')
async updateChildDevice(@Param('id') id: number, @Body('deviceId') deviceId: string) {
  return await this.childrenService.updateDevice(id, deviceId);
  }

  @Delete(':id')
  async deleteChild(@Param('id') id: number) {
    return await this.childrenService.deleteChild(id);
  }
  @Public() // 개발/테스트 중에는 인증을 잠시 풀어두고 확인하는 것이 편합니다.
  @Post(':id/test-prompt')
  async testPromptFilter(
    @Param('id') childId: number,
    @Body('customPrompt') customPrompt: string,
  ) {
    // 1. DTO 객체 생성 (service에 넘겨줄 형식)
    const dto = new UpdateChildSettingsDto();
    dto.customPrompt = customPrompt;

    // 2. 서비스 호출 (이미 GuardService가 주입되어 있으므로 필터링이 자동으로 적용됨)
    return await this.childrenService.updateSettings(childId, dto);
  }
  
  @Patch('device/:deviceId/settings')
  async updateDeviceSettings(
    @Param('deviceId') deviceId: string,
    @Body() body: { volume?: number; ledColor?: string; isPowerOn?: boolean },
  ) {
    // 앞서 서비스에 추가한 updateDeviceSettings 메서드 호출
    return await this.childrenService.updateDeviceSettings(deviceId, body);
  }

@Public()
@Post('test')
async testInteraction(@Body() body: any) { // DTO를 빼고 any로 받으세요
  console.log('들어온 데이터:', body); // 서버 터미널에서 데이터가 찍히는지 확인

  // 데이터가 안 들어오면 body.deviceId 식으로 접근이 안 될 테니 여기서 확인 가능
  const { deviceId, intensity, changedCount } = body;

  return await this.childrenService.processFullInteraction(
    deviceId,
    undefined,
    Number(intensity) || 0, // 강제로 숫자로 변환
    Number(changedCount) || 0,
  );
}
}