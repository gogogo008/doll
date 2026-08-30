import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Interaction } from '../entities/interaction.entity';
import { Child } from '../entities/child.entity';
import { Feedback } from '../entities/feedback.entity';
import { Inject, forwardRef } from '@nestjs/common';
import { DollGateway } from './doll.gateway';
import gTTS = require('gtts');
import axios from 'axios';

const SENSOR_NAMES = [
  'left_cheek_upper (왼쪽 볼 위)', 'left_cheek_lower (왼쪽 볼 아래)', 'left_cheek_front (왼쪽 볼 코쪽)',
  'right_cheek_upper (오른쪽 볼 위)', 'right_cheek_lower (오른쪽 볼 아래)', 'right_cheek_front (오른쪽 볼 코쪽)',
  'head_top_left (정수리 왼쪽)', 'head_top_right (정수리 오른쪽)',
  'head_back_upper_left (뒤통수 위 왼쪽)', 'head_back_upper_right (뒤통수 위 오른쪽)',
  'head_back_lower_left (뒤통수 아래 왼쪽)', 'head_back_lower_right (뒤통수 아래 오른쪽)',
  'belly_top_left (배 위 왼쪽)', 'belly_top_right (배 위 오른쪽)',
  'belly_mid_left (배 중앙 왼쪽)', 'belly_mid_center (배 중앙)', 'belly_mid_right (배 중앙 오른쪽)',
  'belly_bottom_left (배 아래 왼쪽)', 'belly_bottom_right (배 아래 오른쪽)',
  'back_top_left (등 위 왼쪽)', 'back_top_right (등 위 오른쪽)',
  'back_mid_outer_left (등 바깥 왼쪽)', 'back_mid_inner_left (등 안쪽 왼쪽)',
  'back_mid_inner_right (등 안쪽 오른쪽)', 'back_mid_outer_right (등 바깥 오른쪽)',
  'back_bottom_left (등 아래 왼쪽)', 'back_bottom_right (등 아래 오른쪽)',
  'left_arm_front (왼팔 앞면)', 'left_arm_back (왼팔 뒷면)',
  'right_arm_front (오른팔 앞면)', 'right_arm_back (오른팔 뒷면)',
  'left_foot (왼발바닥)', 'right_foot (오른발바닥)'
];

export interface SensorPayload {
  type: 'sensor';
  event_id: number;
  state: 'start' | 'update' | 'end';
  timestamp_ms: number;
  duration_ms?: number;
  pressure: {
    delta: number[];
    peak?: number[];
  };
  imu: {
    accel_peak?: number;
    accel_avg?: number;
    gyro_peak?: number;
    orientation?: { roll: number; pitch: number; yaw: number };
    orientation_change?: number;
  };
}

@Injectable()
export class DollService {
  private genAI: GoogleGenerativeAI;

  constructor(
    @InjectRepository(Interaction)
    private interactionRepository: Repository<Interaction>,
    @InjectRepository(Child)
    private childRepository: Repository<Child>,
    @InjectRepository(Feedback)
    private feedbackRepository: Repository<Feedback>,
    @Inject(forwardRef(() => DollGateway))
    private readonly dollGateway: DollGateway,
    @Inject('SUPABASE_CLIENT') private readonly supabase: any,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('❌ .env 파일에 GEMINI_API_KEY가 없습니다!');
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  private addWavHeader(pcmBuffer: Buffer, sampleRate = 16000, numChannels = 1, bitDepth = 16): Buffer {
    const header = Buffer.alloc(44);
    const dataSize = pcmBuffer.length;
    const byteRate = (sampleRate * numChannels * bitDepth) / 8;
    const blockAlign = (numChannels * bitDepth) / 8;

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  private parseSensorEvents(events: SensorPayload[]): {
    sensorSummary: string;
    maxIntensity: number;
    imuSummary: string;
  } {
    if (!events || events.length === 0) {
      return {
        sensorSummary: '- 자극이 감지되지 않음 (비접촉 상태)',
        maxIntensity: 0,
        imuSummary: 'IMU 데이터 없음',
      };
    }

    const maxPressurePerSensor = new Array(33).fill(0);
    let overallMaxPressure = 0;
    let maxAccelPeak = 0;
    let maxGyroPeak = 0;
    let maxOrientationChange = 0;

    for (const event of events) {
      if (!event) continue;

      const pressures = event.pressure?.peak || event.pressure?.delta || [];
      pressures.forEach((val, idx) => {
        if (val > maxPressurePerSensor[idx]) {
          maxPressurePerSensor[idx] = val;
        }
        if (val > overallMaxPressure) {
          overallMaxPressure = val;
        }
      });

      if (event.imu) {
        if ((event.imu.accel_peak || 0) > maxAccelPeak) maxAccelPeak = event.imu.accel_peak!;
        if ((event.imu.gyro_peak || 0) > maxGyroPeak) maxGyroPeak = event.imu.gyro_peak!;
        if ((event.imu.orientation_change || 0) > maxOrientationChange) {
          maxOrientationChange = event.imu.orientation_change!;
        }
      }
    }

    const activeSensors: string[] = [];
    maxPressurePerSensor.forEach((val, idx) => {
      if (val >= 10 && SENSOR_NAMES[idx]) {
        let level = '약함';
        if (val > 300) level = '매우 강함';
        else if (val > 100) level = '강함';
        else if (val > 40) level = '보통';

        activeSensors.push(`- ${SENSOR_NAMES[idx]}: 최고 변화량 ${val} (${level})`);
      }
    });

    const sensorSummary = activeSensors.length > 0
      ? activeSensors.join('\n')
      : '- 자극이 감지되지 않음 (비접촉 상태)';

    const imuSummary = `가속도 Peak: ${maxAccelPeak}, 자이로 Peak: ${maxGyroPeak}, 자세변화: ${maxOrientationChange}°`;

    return {
      sensorSummary,
      maxIntensity: overallMaxPressure,
      imuSummary,
    };
  }

  /**
   * 🚀 최적화된 인터랙션 처리:
   * 1. AI 텍스트 생성 및 TTS 음성 파일 생성/업로드(aiAudioUrl 확보)까지는 즉시 수행하여 ESP32에 바로 전달
   * 2. DB 저장, 사용자 음성 파일 백업, RAG 임베딩 업데이트는 백그라운드(setImmediate)로 분리
   */
  async processFullInteraction(
    deviceId: string,
    pcmAudioBuffer?: Buffer,
    sensorData?: SensorPayload | SensorPayload[],
    parentMessage?: string,
  ) {
    const child = await this.childRepository.findOne({
      where: { device: { deviceId: deviceId } },
      relations: ['device'],
    });

    if (!child) {
      console.warn(`[Interaction ⚠️] 등록되지 않은 Device ID: ${deviceId}`);
      return { success: false, reply: "등록되지 않은 인형 친구예요. 관리자에게 문의해주세요!" };
    }

    let selectedReply = '';
    let aiAnalysis: any = {};
    let maxIntensity = 0;

    if (parentMessage && parentMessage.trim() !== '') {
      selectedReply = parentMessage;
      aiAnalysis = {
        context: '보호자 직접 메시지',
        emotion: '안정',
        reason: '보호자가 스마트폰 앱을 통해 직접 입력한 메시지입니다.',
        action: 2,
        candidates: []
      };
    } else {
      const sensorEvents: SensorPayload[] = Array.isArray(sensorData)
        ? sensorData
        : sensorData
        ? [sensorData]
        : [];

      const sensorResult = this.parseSensorEvents(sensorEvents);
      maxIntensity = sensorResult.maxIntensity;

      const hasAudio = pcmAudioBuffer && pcmAudioBuffer.length > 0;
      const hasTouch = maxIntensity > 10;

      if (!hasAudio && !hasTouch) {
        return { 
          success: false, 
          reply: null, 
          message: 'No active interaction detected.' 
        };
      }

      // 1. 제미나이에게 음성을 보내서 텍스트만 빠르게 추출 (STT)
      const sttModel = this.genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
      const sttParts: any[] = [
        { text: "이 음성을 듣고 아이가 한 말만 정확히 텍스트로 변환해라. 다른 설명 없이 오직 아이가 말한 텍스트만 출력해." }
      ];

      if (pcmAudioBuffer && pcmAudioBuffer.length > 0) {
        const wavBuffer = this.addWavHeader(pcmAudioBuffer, 16000, 1, 16);
        sttParts.push({
          inlineData: { data: wavBuffer.toString('base64'), mimeType: 'audio/wav' }
        });
      }

      let userSttText = '';
      try {
        const sttResult = await sttModel.generateContent(sttParts);
        const sttResponse = await sttResult.response;
        userSttText = sttResponse.text().trim();
        console.log(`🎤 [STT 추출 완료]: ${userSttText}`);
      } catch (sttErr) {
        console.error('❌ [STT Error]:', sttErr);
        userSttText = '';
      }

      // 2. 추출된 텍스트(또는 센서)를 바탕으로 4가지 정형화된 답변 중 하나를 선택
      let context = '';
      let emotion = '';
      let action = 1;

      if (userSttText.includes('화나') || userSttText.includes('짜증') || maxIntensity > 150) {
        selectedReply = "민석아 많이 화가 났구나, 뭐 때문에 그렇게 화가 났니.";
        context = "화남/진정"; 
        emotion = "화남"; 
        action = 3;
      } else if (userSttText.includes('배고') || userSttText.includes('밥') || userSttText.includes('먹어')) {
        selectedReply = "배가 고픈가 보구나, 지금 먹고 싶은 음식이 뭐니";
        context = "식사/욕구"; 
        emotion = "배고픔"; 
        action = 2;
      } else if (userSttText.includes('좋아') || userSttText.includes('고마워')) {
        selectedReply = "아이 기분좋아, 고마워 민석아";
        context = "칭찬/만족"; 
        emotion = "기쁨"; 
        action = 1;
      } else {
        selectedReply = "아이 기분좋아, 고마워 민석아";
        context = "애착/포옹"; 
        emotion = "따뜻함"; 
        action = 1;
      }

      aiAnalysis = {
        context,
        emotion,
        action,
        reason: `STT 추출 텍스트("${userSttText}") 및 센서 기반 선택`,
        candidates: []
      };
    }

    // 3. ESP32 재생을 위한 AI 음성(TTS) 파일 생성 및 Supabase 업로드는 동기로 즉시 처리하여 URL 확보
    let aiAudioUrl: string | null = null;
    if (!child.isMuted && selectedReply) {
      try {
        const mp3Buffer = await this.synthesizeSpeechToBuffer(selectedReply);
        const aiVoiceFileName = `${deviceId}/ai_${Date.now()}.mp3`;
        const { error: aiUploadError } = await this.supabase.storage
          .from('voice-bucket')
          .upload(aiVoiceFileName, mp3Buffer, { contentType: 'audio/mp3', upsert: false });

        if (!aiUploadError) {
          const { data: publicUrlData } = this.supabase.storage.from('voice-bucket').getPublicUrl(aiVoiceFileName);
          aiAudioUrl = publicUrlData.publicUrl;
          console.log(`🔊 [AI Voice URL]: ${aiAudioUrl}`);
        }
      } catch (ttsErr) {
        console.error('❌ [TTS Generation/Upload Error]:', ttsErr);
      }
    }

    // 4. 사용자 음성 업로드, DB 저장, 임베딩 업데이트 등 상대적으로 무겁고 결과에 지장을 안 주는 작업은 백그라운드로 분리
    setImmediate(async () => {
      try {
        let audioUrl: string | null = null;

        if (pcmAudioBuffer && pcmAudioBuffer.length > 0) {
          const wavBuffer = this.addWavHeader(pcmAudioBuffer, 16000, 1, 16);
          const fileName = `${deviceId}/${Date.now()}.wav`;
          const { error: uploadError } = await this.supabase.storage
            .from('voice-bucket')
            .upload(fileName, wavBuffer, { contentType: 'audio/wav', upsert: false });

          if (!uploadError) {
            const { data: publicUrlData } = this.supabase.storage.from('voice-bucket').getPublicUrl(fileName);
            audioUrl = publicUrlData.publicUrl;
            console.log(`🎤 [User Voice URL]: ${audioUrl}`);
          }
        }

        const newInteraction = this.interactionRepository.create({
          child: child,
          device: child.device,
          context: aiAnalysis.context || '일반대화',
          touchIntensity: maxIntensity,
          detectedEmotion: aiAnalysis.emotion || '안정',
          aiReply: selectedReply,
          candidateReplies: aiAnalysis.candidates || [],
          rawText: aiAnalysis.reason || 'AI 응답',
          audioUrl: audioUrl,
        } as Interaction);

        const savedInteraction = await this.interactionRepository.save(newInteraction);

        if (!parentMessage) {
          const embeddingValue = await this.getEmbedding(selectedReply + (aiAnalysis.context || ''));
          await this.interactionRepository.update(savedInteraction.id, { embedding: embeddingValue });
        }
      } catch (bgErr) {
        console.error('❌ [Background Processing Error]:', bgErr);
      }
    });

    return {
      success: true,
      ...aiAnalysis,
      selectedReply,
      aiAudioUrl, // ESP32가 즉시 재생할 수 있도록 생성된 음성 URL 포함 반환
    };
  }

  async handleParentMessage(deviceId: string, text: string) {
    console.log(`💌 [Parent Message Handler] Device: ${deviceId} | 내용: "${text}"`);

    const child = await this.childRepository.findOne({
      where: { device: { deviceId: deviceId } },
      relations: ['device'],
    });

    if (!child) {
      throw new Error('등록되지 않은 인형 기기입니다.');
    }

    const result = await this.processFullInteraction(deviceId, undefined, undefined, text);

    this.dollGateway.sendParentMessageToDevice(deviceId, {
      type: 'parent_message',
      text: text,
      aiAudioUrl: result.aiAudioUrl,
      action: result.action || 2,
    });

    return { success: true, message: '보호자 메시지가 인형에 전송되었습니다.' };
  }

  async synthesizeSpeechToBuffer(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const gtts = new gTTS(text, 'ko');
      const chunks: Buffer[] = [];
      const stream = gtts.stream();
      
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (err) => reject(err));
    });
  }

  private async getEmbedding(text: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-embedding-2' });
      const result = await model.embedContent(text);
      return JSON.stringify(result.embedding.values);
    } catch (error) {
      return JSON.stringify([]);
    }
  }

  private getCurrentTimeInMinutes(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  private async findRelevantMemory(
    childId: number, 
    currentEmbedding: string, 
    predictedContext: string
  ): Promise<string> {
    try {
      const memories = await this.interactionRepository.query(`
        SELECT i."aiReply", i.context, i."detectedEmotion",
               (SELECT AVG(CASE 
               WHEN f.score = 'good' THEN 4 
               WHEN f.score = 'normal' THEN 2 
               ELSE -1 END) 
               FROM feedbacks f WHERE f."interactionId" = i.id) as avg_score,
               (i.embedding::vector <=> $3::vector) AS dist
        FROM interactions i
        WHERE i."childId" = $1
        ORDER BY 
          (CASE WHEN i.context = $2 THEN 0 ELSE 1 END), 
          (SELECT AVG(CASE 
                WHEN f.score = 'good' THEN 3 
                WHEN f.score = 'normal' THEN 2 
                ELSE 1 END) 
                FROM feedbacks f WHERE f."interactionId" = i.id) DESC NULLS LAST,
          dist ASC
        LIMIT 3
      `, [childId, predictedContext, currentEmbedding]);

      if (memories.length === 0) return "아직 기억된 대화가 없습니다.";

      return memories.map(m =>
        `- [상황:${m.context}] 아이의 감정:${m.detectedEmotion} | 인형의 대답:${m.aiReply}`
      ).join('\n');
    } catch (err) {
      return "기억 검색 중 오류 발생.";
    }
  }

  async embedAllExistingInteractions() {
    const interactions = await this.interactionRepository.find({
      where: { embedding: IsNull() }, 
    });

    for (const interaction of interactions) {
      try {
        const textToEmbed = `${interaction.aiReply} ${interaction.context}`;
        const embeddingValue = await this.getEmbedding(textToEmbed);
        await this.interactionRepository.update(interaction.id, { embedding: embeddingValue });
        await new Promise(resolve => setTimeout(resolve, 500)); 
      } catch (error) {
        console.error(`실패: Interaction ID ${interaction.id}`, error);
      }
    }
  }
}