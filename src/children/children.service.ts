import { 
  Injectable, 
  NotFoundException, 
  ConflictException,
  BadRequestException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Child } from '../entities/child.entity';
import { Device } from '../entities/device.entity';
import { User } from '../entities/user.entity';
import { RegisterChildDto } from '../auth/dto/register-child.dto';
import { Interaction } from '../entities/interaction.entity';
import { UpdateChildSettingsDto } from 'src/auth/dto/update-child-settings.dto';
import { GuardService } from '../guard.service';
import { DollService } from '../doll/doll.service';

@Injectable()
export class ChildrenService {
  constructor(
    @InjectRepository(Child) private childRepository: Repository<Child>,
    @InjectRepository(Device) private deviceRepository: Repository<Device>,
    @InjectRepository(Interaction) private interactionRepository: Repository<Interaction>,

    private readonly guardService: GuardService,
    private readonly dollService: DollService,
  ) {}
  
  // 1. 유저 ID로 등록된 아이들 목록 조회 (신규 맞춤형 필드 및 기기 정보 포함)
  async findByUser(userId: number): Promise<Child[]> {
    const children = await this.childRepository.find({
      where: { users: { id: userId } }, 
      relations: ['users', 'device'], 
      select: {
        id: true,
        name: true,
        age: true,
        gender: true,
        characteristics: true,
        languageLevel: true,     // 추가
        intelligenceLevel: true, // 추가
        mentalAge: true,         // 추가
        isMuted: true,    
        isEchoMode: true,        // 추가
        customPrompt: true,
        device: {
          deviceId: true,
          modelName: true,
          volume: true,          // 기기 음량 추가
          ledpower: true,        // 기기 LED 세기 추가
          isPowerOn: true,       // 기기 전원 상태 추가
        },
        users: {
          id: true,
          name: true,
          phoneNumber: true,
          role: true,
        },
      }
    });

    return children.map(child => {
      if (child.users) {
        child.users = child.users.filter(user => user.id !== userId);
      }
      return child;
    });
  }

  // 2. 아이 등록 및 인형 매칭
  async register(dto: RegisterChildDto, currentUser: User) {
    const device = await this.deviceRepository.findOne({
      where: { deviceId: dto.deviceId },
    });

    if (!device) {
      throw new NotFoundException('등록되지 않은 인형 ID입니다. 관리자에게 문의하세요.');
    }

    const existingChildWithDevice = await this.childRepository.findOne({
      where: { device: { deviceId: dto.deviceId } },
      relations: ['users'],
    });

    if (existingChildWithDevice) {
      const isAlreadyConnectedToMe = existingChildWithDevice.users.some(user => user.id === currentUser.id);
      if (isAlreadyConnectedToMe) {
        throw new ConflictException('이미 본인에게 등록된 아이(인형)입니다.');
      }
      throw new ConflictException('이미 다른 아이에게 등록된 인형 ID입니다.');
    }

    const existingChildToUser = await this.childRepository.findOne({
      where: { 
        name: dto.name,
        users: { id: currentUser.id }
      }
    });
    if (existingChildToUser) {
      throw new ConflictException('이미 동일한 이름으로 등록된 아이 정보가 존재합니다.');
    }

    const newChild = this.childRepository.create({
      name: dto.name,
      age: dto.age,
      gender: dto.gender,
      characteristics: dto.characteristics,
      device: device,
      users: [currentUser],
    });

    return await this.childRepository.save(newChild);
  }

  // 3. 아이와 연동된 인형 기기(모델) 변경 기능
  async updateDevice(childId: number, newDeviceId: string) {
    const device = await this.deviceRepository.findOne({
      where: { deviceId: newDeviceId }
    });
    if (!device) {
      throw new NotFoundException('존재하지 않는 인형 ID입니다.');
    }

    const occupiedChild = await this.childRepository.findOne({
      where: { device: { deviceId: newDeviceId } }
    });
    if (occupiedChild && occupiedChild.id !== childId) {
      throw new ConflictException('해당 인형은 이미 다른 아이에게 연결되어 있어 변경할 수 없습니다.');
    }

    const child = await this.childRepository.findOne({
      where: { id: childId }
    });
    if (!child) {
      throw new NotFoundException('존재하지 않는 아이 정보입니다.');
    }

    child.device = device;
    return await this.childRepository.save(child);
  }

  // 4. 등록한 아이 정보 완전 삭제 기능
  async deleteChild(childId: number) {
    const child = await this.childRepository.findOne({
      where: { id: childId },
      relations: ['users']
    });

    if (!child) {
      throw new NotFoundException('삭제하려는 아이 정보가 존재하지 않습니다.');
    }

    return await this.childRepository.remove(child);
  }

  // 5. 일자별 상호작용 기록 조회
  async findInteractionsByDate(childId: number, dateString?: string) {
    const now = new Date();
    let start = dateString ? new Date(dateString) : new Date();

    if (isNaN(start.getTime())) {
      start = new Date();
    }

    const end = new Date(start);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return await this.interactionRepository
      .createQueryBuilder('interaction')
      .select([
        'interaction.id',
        'interaction.rawText',
        'interaction.touchIntensity',
        'interaction.detectedEmotion',
        'interaction.aiReply',
        'interaction.createdAt',
        'interaction.audioUrl',
      ])
      .where('interaction.childId = :childId', { childId })
      .andWhere('interaction.createdAt BETWEEN :start AND :end', { start, end })
      .orderBy('interaction.createdAt', 'ASC')
      .getMany();
  }

  // 6. 아이의 맞춤형 설정(음소거, 에코모드, 발달 수준, 프롬프트) 업데이트 기능
  async updateSettings(childId: number, dto: UpdateChildSettingsDto) {
    const child = await this.childRepository.findOne({
      where: { id: childId }
    });

    if (!child) {
      throw new NotFoundException('존재하지 않는 아이 정보입니다.');
    }

    if (dto.isMuted !== undefined) {
      child.isMuted = dto.isMuted;
    }
    if (dto.isEchoMode !== undefined) {
      child.isEchoMode = dto.isEchoMode;
    }
    if (dto.languageLevel !== undefined) {
      child.languageLevel = dto.languageLevel;
    }
    if (dto.intelligenceLevel !== undefined) {
      child.intelligenceLevel = dto.intelligenceLevel;
    }
    if (dto.mentalAge !== undefined) {
      child.mentalAge = dto.mentalAge;
    }

    if (dto.customPrompt !== undefined) {
      const safety = await this.guardService.checkSafety(dto.customPrompt);
      
      if (!safety.isSafe) {
        throw new BadRequestException(`보호자님, 설정하신 내용이 정책상 부적절합니다: ${safety.reason}`);
      }

      child.customPrompt = dto.customPrompt;
    }
    
    return await this.childRepository.save(child);
  }

  // 7. 주간 통계 (전주 대비 비교 기능 포함)
  async getWeeklyStatistics(childId: number): Promise<any> {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    today.setHours(23, 59, 59, 999);

    const currentInteractions = await this.interactionRepository.find({
      where: {
        child: { id: childId },
        createdAt: Between(sevenDaysAgo, today),
      },
      order: { createdAt: 'ASC' },
    });

    const fourteenDaysAgo = new Date(sevenDaysAgo);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 7);
    const eightDaysAgo = new Date(sevenDaysAgo);
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 1);
    eightDaysAgo.setHours(23, 59, 59, 999);

    const prevInteractions = await this.interactionRepository.find({
      where: {
        child: { id: childId },
        createdAt: Between(fourteenDaysAgo, eightDaysAgo),
      },
    });

    return this.processStatisticsData(currentInteractions, prevInteractions, 'week');
  }


  async updateDeviceSettings(deviceId: string, dto: { volume?: number; ledpower?: number; isPowerOn?: boolean }) {
  const device = await this.deviceRepository.findOne({ where: { deviceId } });
  
  if (!device) {
    throw new NotFoundException('존재하지 않는 인형 기기입니다.');
  }

  if (dto.volume !== undefined) device.volume = dto.volume;
  if (dto.ledpower !== undefined) device.ledpower = dto.ledpower;
  if (dto.isPowerOn !== undefined) device.isPowerOn = dto.isPowerOn;

  return await this.deviceRepository.save(device);
}
  // 8. 월간 통계 (전월 대비 비교 기능 포함)
  async getMonthlyStatistics(childId: number, year: number, month: number): Promise<any> {
    const now = new Date();
    const y = !isNaN(Number(year)) ? Number(year) : now.getFullYear();
    const m = !isNaN(Number(month)) ? Number(month) : now.getMonth() + 1;

    const startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(y, m, 0, 23, 59, 59, 999);

    const currentInteractions = await this.interactionRepository
      .createQueryBuilder('interaction')
      .where('interaction.childId = :childId', { childId })
      .andWhere('interaction.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .orderBy('interaction.createdAt', 'ASC')
      .getMany();

    const prevYear = m === 1 ? y - 1 : y;
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevStartDate = new Date(prevYear, prevMonth - 1, 1, 0, 0, 0, 0);
    const prevEndDate = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);

    const prevInteractions = await this.interactionRepository
      .createQueryBuilder('interaction')
      .where('interaction.childId = :childId', { childId })
      .andWhere('interaction.createdAt BETWEEN :prevStartDate AND :prevEndDate', { prevStartDate, prevEndDate })
      .getMany();

    return this.processStatisticsData(currentInteractions, prevInteractions, 'month');
  }

// 9. 모든 기획 요소를 반영한 종합 심층 분석 및 가공 헬퍼 로직 (수정본)
  private processStatisticsData(currentInteractions: any[], prevInteractions: any[], mode: 'week' | 'month'): any {
    const totalCount = currentInteractions.length;
    const totalIntensity = currentInteractions.reduce((sum, item) => sum + (item.touchIntensity || 0), 0);
    const avgIntensity = totalCount > 0 ? Math.round(totalIntensity / totalCount) : 0;

    const prevTotalCount = prevInteractions.length;
    const prevTotalIntensity = prevInteractions.reduce((sum, item) => sum + (item.touchIntensity || 0), 0);
    const prevAvgIntensity = prevTotalCount > 0 ? Math.round(prevTotalIntensity / prevTotalCount) : 0;
    
    // 평균 자극 강도 증감률
    const intensityDiffPercent = prevAvgIntensity > 0 
      ? Math.round(((avgIntensity - prevAvgIntensity) / prevAvgIntensity) * 100) 
      : 0;

    // 상호작용 횟수 증감률 추가 계산 (지난 기간 비교용)
    const countDiffPercent = prevTotalCount > 0
      ? Math.round(((totalCount - prevTotalCount) / prevTotalCount) * 100)
      : 0;

    const emotionMap: Record<string, number> = {};
    const contextMap: Record<string, number> = {};
    const timelineMap: Record<string, { count: number; intensitySum: number }> = {};
    
    const hourlyHeatmapMap: Record<string, { hour: number; dayOfWeek: number; count: number; intensitySum: number }> = {};
    const contextEmotionMatrix: Record<string, Record<string, number>> = {};

    let aiSuccessCount = 0;
    let aiTotalTargetCount = 0;

    if (mode === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        timelineMap[label] = { count: 0, intensitySum: 0 };
      }
    } else {
      timelineMap['1주 전'] = { count: 0, intensitySum: 0 };
      timelineMap['2주 전'] = { count: 0, intensitySum: 0 };
      timelineMap['3주 전'] = { count: 0, intensitySum: 0 };
      timelineMap['이번 주'] = { count: 0, intensitySum: 0 };
    }
    
    currentInteractions.forEach((item) => {
      const itemDate = new Date(item.createdAt);
      const emotion = item.detectedEmotion || '미분류';
      const context = item.context || '휴식';
      const intensity = item.touchIntensity || 0;

      emotionMap[emotion] = (emotionMap[emotion] || 0) + 1;
      contextMap[context] = (contextMap[context] || 0) + 1;

      const hour = itemDate.getHours();
      const dayOfWeek = itemDate.getDay();
      const heatmapKey = `${dayOfWeek}-${hour}`;
      if (!hourlyHeatmapMap[heatmapKey]) {
        hourlyHeatmapMap[heatmapKey] = { hour, dayOfWeek, count: 0, intensitySum: 0 };
      }
      hourlyHeatmapMap[heatmapKey].count++;
      hourlyHeatmapMap[heatmapKey].intensitySum += intensity;

      if (!contextEmotionMatrix[context]) {
        contextEmotionMatrix[context] = {};
      }
      contextEmotionMatrix[context][emotion] = (contextEmotionMatrix[context][emotion] || 0) + 1;

      // [기준 명시] 불안, 분노, 슬픔 감지 시 AI가 답변을 제공했고, 자극 강도가 50 미만으로 완화되었을 때 성공으로 측정
      if (['불안', '분노', '슬픔'].includes(emotion)) {
        aiTotalTargetCount++;
        if (item.aiReply && intensity < 50) {
          aiSuccessCount++;
        }
      }

      if (mode === 'week') {
        const label = `${itemDate.getMonth() + 1}/${itemDate.getDate()}`;
        if (timelineMap[label]) {
          timelineMap[label].count++;
          timelineMap[label].intensitySum += intensity;
        }
      } else {
        const diffTime = new Date().getTime() - itemDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        let label = '이번 주';
        if (diffDays >= 21) label = '1주 전';
        else if (diffDays >= 14) label = '2주 전';
        else if (diffDays >= 7) label = '3주 전';

        if (timelineMap[label]) {
          timelineMap[label].count++;
          timelineMap[label].intensitySum += intensity;
        }
      }
    });

    const topTriggers = Object.keys(contextMap).map((context) => {
      const contextItems = currentInteractions.filter(i => (i.context || '휴식') === context);
      const cIntensitySum = contextItems.reduce((sum, i) => sum + (i.touchIntensity || 0), 0);
      return {
        context,
        count: contextMap[context],
        avgIntensity: contextItems.length > 0 ? Math.round(cIntensitySum / contextItems.length) : 0,
      };
    }).sort((a, b) => b.avgIntensity - a.avgIntensity);

    const emotionDistribution = Object.keys(emotionMap).map((emotion) => ({
      emotion,
      count: emotionMap[emotion],
      percentage: totalCount > 0 ? Number(((emotionMap[emotion] / totalCount) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.count - a.count);

    const hourlyHeatmap = Object.values(hourlyHeatmapMap).map(item => ({
      hour: item.hour,
      dayOfWeek: item.dayOfWeek,
      count: item.count,
      avgIntensity: Math.round(item.intensitySum / item.count),
    }));

    const topContext = topTriggers.length > 0 ? topTriggers[0].context : '일상';
    const dominantEmotion = emotionDistribution.length > 0 ? emotionDistribution[0].emotion : '안정';
    const aiSuccessRate = aiTotalTargetCount > 0 ? Math.round((aiSuccessCount / aiTotalTargetCount) * 100) : 85;

    // --- 기간별(주간/월간) 비교 코멘트 자동 생성 텍스트 가공 ---
    const periodName = mode === 'week' ? '지난주' : '지난달';
    
    let comparisonText = '';
    if (prevTotalCount === 0) {
      comparisonText = `${periodName} 비교 데이터가 없어 이번 기간 단독 분석을 제공합니다.`;
    } else {
      const intensityTrend = intensityDiffPercent === 0 
        ? '비슷한 자극 강도' 
        : intensityDiffPercent > 0 
          ? `자극 강도가 ${intensityDiffPercent}% 증가` 
          : `자극 강도가 ${Math.abs(intensityDiffPercent)}% 감소`;
          
      const countTrend = countDiffPercent === 0 
        ? '비슷한 소통 횟수' 
        : countDiffPercent > 0 
          ? `상호작용 횟수가 ${countDiffPercent}% 증가` 
          : `상호작용 횟수가 ${Math.abs(countDiffPercent)}% 감소`;

      // 💡 템플릿 리터럴 문법 오류(${countTrend}로 정확히 감싸기) 수정 완료
      comparisonText = `${periodName} 대비 ${countTrend}를 보였으며, 평균 ${intensityTrend}를 기록했습니다.`;
    }

    const aiInsightComment = totalCount > 0 
      ? `${comparisonText} 주요 자극 상황은 '${topContext}'이며, 불안·분노·슬픔 감지 시 AI 개입으로 자극을 완화한 'AI 케어 성공률'은 ${aiSuccessRate}%(총 ${aiTotalTargetCount}건 중 ${aiSuccessCount}건 안정화)로 측정되었습니다.`
      : '선택하신 기간 내에 기록된 상호작용 데이터가 없습니다.';

    return {
      period: { 
        year: mode === 'month' ? new Date().getFullYear() : 0, 
        month: mode === 'month' ? new Date().getMonth() + 1 : 0 
      },
      summary: {
        totalInteractions: totalCount,
        avgTouchIntensity: avgIntensity,
        dominantEmotion,
        intensityDiffPercent,
        aiInsightComment, // 제미나이가 정교하게 조합한 비교 및 측정 기준 설명 코멘트 포함
      },
      topTriggers,
      hourlyHeatmap,
      emotionDistribution,
      clinicalInsights: {
        contextEmotionMatrix,
        aiSuccessRate,
        measurementCriteria: '불안, 분노, 슬픔 감지 시 AI 답변 제공 및 터치 강도 50 미만 완화 기준 측정', // UI에서 노출할 수 있도록 추가 제공
      }
    };
  }
  // 10. 기기 상호작용 처리 시 아이의 설정 상태(뮤트, 에코모드, 발달 수준 등)를 동적으로 연동
  async processFullInteraction(
    deviceId: string,
    audioBuffer?: Buffer,
    intensity: number = 0,
    changedCount: number = 0,
  ) {
    // 인형 기기 ID에 매칭된 아이의 세부 맞춤형 설정 정보를 함께 조회
    const child = await this.childRepository.findOne({
      where: { device: { deviceId } },
      relations: ['device'],
    });

    let statusColor = "UNKNOWN";

    if (changedCount === 2) {
      statusColor = intensity >= 50 ? "YELLOW, GREEN" : "YELLOW, RED";
    } else if (changedCount === 1) {
      statusColor = intensity >= 50 ? "RED" : "GREEN";
    }

    return {
      success: true,
      statusColor: statusColor,
      // 하드웨어 제어 및 대화형 AI 처리 시 활용할 수 있는 아이 및 기기 상태 정보 포함
      childSettings: child ? {
        isMuted: child.isMuted,
        isEchoMode: child.isEchoMode,
        languageLevel: child.languageLevel,
        intelligenceLevel: child.intelligenceLevel,
        mentalAge: child.mentalAge,
        customPrompt: child.customPrompt,
      } : null,
      deviceSettings: child?.device ? {
        volume: child.device.volume,
        ledColor: child.device.ledpower,
        isPowerOn: child.device.isPowerOn,
      } : null,
    };
  }
  // 11. 보호자가 입력한 메시지를 아이 ID 기준으로 인형에 실시간 전송
  async sendParentMessage(childId: number, message: string) {
    const child = await this.childRepository.findOne({
      where: { id: childId },
      relations: ['device'],
    });

    if (!child) {
      throw new NotFoundException('존재하지 않는 아이 정보입니다.');
    }

    if (!child.device || !child.device.deviceId) {
      throw new NotFoundException('아이에게 연결된 인형 기기(Device)가 없습니다.');
    }

    // DollService를 호출하여 음성 합성 및 소켓 전송 트리거
    await this.dollService.handleParentMessage(child.device.deviceId, message);

    return {
      success: true,
      message: '보호자 메시지가 인형으로 전송되었습니다.',
      targetDeviceId: child.device.deviceId,
      sentMessage: message,
    };
  }
}
