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

    const wavBuffer = Buffer.concat([header, pcmBuffer]);
    console.log(`🎵 [WAV Transform] RAW PCM(${pcmBuffer.length} B) -> WAV 변환 완료 (${wavBuffer.length} B, SampleRate: ${sampleRate}Hz)`);
    return wavBuffer;
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

  async processFullInteraction(
    deviceId: string,
    pcmAudioBuffer?: Buffer,
    sensorData?: SensorPayload | SensorPayload[],
    parentMessage?: string,
  ) {
    const audioSize = pcmAudioBuffer ? pcmAudioBuffer.length : 0;
    const estimatedDurationSec = (audioSize / (16000 * 2)).toFixed(2);
    console.log(`🎙️ [Service Audio Analysis] Device: ${deviceId} | 수신 오디오 크기: ${audioSize} bytes (약 ${estimatedDurationSec}초 분량)`);

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
    let audioUrl: string | null = null;

    console.log(`🔍 [Storage 디버깅] pcmAudioBuffer 존재 여부:`, !!pcmAudioBuffer, '길이:', pcmAudioBuffer?.length || 0);

    if (pcmAudioBuffer && pcmAudioBuffer.length > 0) {
      try {
        const wavBuffer = this.addWavHeader(pcmAudioBuffer, 16000, 1, 16);
        const fileName = `${deviceId}/${Date.now()}.wav`;
        console.log(`📤 [Supabase Storage] 업로드 시도 중... 경로: voice-bucket/${fileName}`);

        const { data: uploadData, error: uploadError } = await this.supabase.storage
          .from('voice-bucket')
          .upload(fileName, wavBuffer, {
            contentType: 'audio/wav',
            upsert: false,
          });

        if (uploadError) {
          console.error('❌ [Supabase Storage 업로드 실패 상세]:', JSON.stringify(uploadError));
        } else {
          const { data: publicUrlData } = this.supabase.storage
            .from('voice-bucket')
            .getPublicUrl(fileName);
          
          audioUrl = publicUrlData.publicUrl;
          console.log(`💾 [Supabase Storage] 음성 파일 업로드 성공! URL: ${audioUrl}`);
        }
      } catch (storageErr) {
        console.error('❌ [Storage 예외 발생]:', storageErr);
      }
    } else {
      console.log(`⚠️ [Supabase Storage 스킵] pcmAudioBuffer가 비어있거나 전달되지 않았습니다.`);
    }

    if (parentMessage && parentMessage.trim() !== '') {
      selectedReply = parentMessage;
      aiAnalysis = {
        context: '보호자 직접 메시지',
        emotion: '안정',
        reason: '보호자가 스마트폰 앱을 통해 직접 입력한 메시지입니다.',
        action: 2,
        candidates: []
      };
      console.log(`💌 [Parent Message Direct Output] 보호자 직접 입력 메시지 우선 적용: "${selectedReply}"`);
    } else {
      const sensorEvents: SensorPayload[] = Array.isArray(sensorData)
        ? sensorData
        : sensorData
          ? [sensorData]
          : [];

      const sensorResult = this.parseSensorEvents(sensorEvents);
      maxIntensity = sensorResult.maxIntensity;
      const { sensorSummary, imuSummary } = sensorResult;

      const hasAudio = pcmAudioBuffer && pcmAudioBuffer.length > 0;
      const hasTouch = maxIntensity > 10;

      if (!hasAudio && !hasTouch) {
        console.log(`[Interaction ⚠️] 입력 음성 0 byte & 터치 유효값 없음 -> 요청 스킵됨 (Device: ${deviceId})`);
        return { 
          success: false, 
          reply: null, 
          message: 'No active interaction detected.' 
        };
      }

      let mlRoutineHint = '';
      let predictedContext = '일반대화';

      try {
        const currentTimeMin = this.getCurrentTimeInMinutes();
        const targetUrl = process.env.ML_SERVER_URL || 'https://doll-python-ml.onrender.com';
        
        const mlResponse = await axios.post(`${targetUrl}/predict-routine`, {
          child_id: child.id,
          current_time_min: currentTimeMin,
          intensity: maxIntensity,
        });

        const { context, probability, isOnRoutine } = mlResponse.data;
        predictedContext = context;

        if (isOnRoutine && probability >= 80) {
          mlRoutineHint = `[강력한 루틴 데이터 참고] 현재 아이가 "${context}" 루틴을 진행 중일 확률이 ${probability}%로 매우 높습니다.`;
        } else {
          mlRoutineHint = `[루틴 참고] 현재 예측된 맥락은 "${context}"(${probability}%)입니다. 음성과 터치를 유연하게 고려하세요.`;
        }
      } catch (mlError: any) {
        mlRoutineHint = '[주의] 예측 서버 점검 중이므로 입력된 데이터만으로 맥락을 추론하세요.';
      }

      const currentStatusText = `상황: ${maxIntensity > 100 ? '강한 자극' : '평온'}, 최고충격강도: ${maxIntensity}`;
      const currentEmbedding = await this.getEmbedding(currentStatusText);
      const memoryHint = await this.findRelevantMemory(child.id, currentEmbedding, predictedContext);

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const basePrompt = child.customPrompt ? child.customPrompt : `
        너는 자폐 스펙트럼(ASD) 아동의 정서 발달과 사회적 상호작용을 돕는 애착 인형 '곰돌이'야.
        딱딱한 치료사가 아닌, 아이가 언제든 기대고 수다 떨 수 있는 친구 역할을 해줘.

        [아이 정보]
        - 이름: ${child.name} (${child.age}세, ${child.gender})
        - 특이사항: ${child.characteristics || '명확하고 단순한 문장을 선호함'}
        - 언어 발달 수준: ${child.languageLevel || '기본 수준'}
        - 지능 수준: ${child.intelligenceLevel || '일반'}
        - 정신 연령: ${child.mentalAge || '나이에 준함'}
        - 에코 모드(말 따라하기) 활성화 여부: ${child.isEchoMode ? '켜짐 (아이의 말을 다정하게 따라하며 대화하세요)' : '꺼짐'}
      `;

      const systemInstruction = `
        ${basePrompt}

        ${mlRoutineHint}
        [과거의 기억(RAG)]
        ${memoryHint}

        [인형 스킨의 33개 센서 감지 현황]
        최고 터치 강도 (Max Peak): ${maxIntensity}
        상세 접촉 부위별 강도:
        ${sensorSummary}

        [인형 동작/기울기 데이터 (IMU)]
        ${imuSummary}

        [친구 같은 인형 말투 규칙]
        아이의 이름(${child.name})을 다정하게 부르며 다가가세요.
        1. 전체 상황에 공통으로 적용하는 기본 프롬프트
        [ 너는 정서 표현에 어려움을 겪는 자폐 스펙트럼 아동의 감정 인식과 표현을 돕는 보조 디바이스 AI이다.
        아동의 표정, 행동, 목소리 또는 센서 입력만으로 감정을 단정하지 말고, 관찰한 상태가 맞는지 아동에게 확인한다. 한 번에 하나의 짧고 구체적인 문장만 사용하며, 비유·반어·추상적인 표현은 피한다.
        질문 후에는 아동이 정보를 처리하고 반응할 수 있도록 충분히 기다린다. 기다리는 동안 같은 질문을 반복하거나 추가 질문으로 재촉하지 않는다. 대기 시간은 아동별 특성에 따라 조정한다.
        말로 대답하도록 강요하지 말고 터치, 압력 센서, 감정 버튼, 그림 선택 등 비언어적 응답도 동등하게 인정한다. 아동의 감정을 옳거나 그른 것으로 평가하지 않으며, 감정을 표현하거나 도움을 요청한 행동을 구체적으로 인정한다.
        아동이 불안, 감각 과부하 또는 강한 거부 반응을 보이면 말의 양과 음량을 줄이고, 질문보다 안정과 안전 확보를 우선한다. 의료적·신체적 위험이 의심되는 경우 자체적으로 판단하거나 해결하려 하지 말고 보호자에게 알린다. ]
        
        [출력 형식]
        반드시 다른 텍스트 없이 오직 아래 JSON 포맷으로만 출력하세요.
        { 
          "context": "분류된 상황",
          "emotion": "분류된 감정", 
          "reply": "아이에게 들려줄 친구 같은 단 한 문장의 다정한 대답", 
          "action": 번호(1:밝음, 2:일반, 3:차분함), 
          "reason": "분석한 터치 부위 및 음성 분석 이유",
          "candidates": [
            { "reply": "...", "style": "공감" },
            { "reply": "...", "style": "지도" },
            { "reply": "...", "style": "놀이" }
          ]
        }
      `;

      const parts: any[] = [{ text: systemInstruction }];

      if (pcmAudioBuffer && pcmAudioBuffer.length > 0) {
        const wavBuffer = this.addWavHeader(pcmAudioBuffer, 16000, 1, 16);
        parts.push({
          inlineData: { data: wavBuffer.toString('base64'), mimeType: 'audio/wav' }
        });
        console.log(`🤖 [Gemini Payload] 멀티모달 오디오 바이너리 패킷 전달 준비 완료 (${wavBuffer.length} bytes Base64 인코딩)`);
      } else {
        console.log(`🤖 [Gemini Payload] 음성 바이너리 없음 (텍스트 및 센서 전용 전달)`);
      }

      try {
        console.log(`🚀 [Gemini Request] Gemini API 분석 요청 시작...`);
        const result = await model.generateContent(parts);
        const response = await result.response;
        
        const cleanJson = response.text().replace(/```json|```/g, '').trim();
        aiAnalysis = JSON.parse(cleanJson);
        selectedReply = aiAnalysis.candidates?.[0]?.reply || aiAnalysis.reply;

        console.log(`✨ [Gemini Response Success] 대답: "${selectedReply}" | 감정: ${aiAnalysis.emotion} | 맥락: ${aiAnalysis.context}`);
      } catch (error) {
        console.error('❌ [Gemini / AI Error]:', error);
        return { success: false, reply: "미안해, 다시 한번 말해줄래?" };
      }
    }

    // [MODIFIED] 기존 Base64 대신 Supabase Storage에 업로드 후 aiAudioUrl 획득
    let aiAudioUrl: string | null = null;
    if (!child.isMuted && selectedReply) {
      try {
        console.log(`🔊 [TTS Generation] 대답 음성 합성(gTTS) 시작: "${selectedReply}"`);
        const mp3Buffer = await this.synthesizeSpeechToBuffer(selectedReply);
        
        const aiVoiceFileName = `${deviceId}/ai_${Date.now()}.mp3`;
        console.log(`📤 [Supabase Storage] AI 음성 업로드 시도 중... 경로: voice-bucket/${aiVoiceFileName}`);

        const { data: uploadData, error: uploadError } = await this.supabase.storage
          .from('voice-bucket')
          .upload(aiVoiceFileName, mp3Buffer, {
            contentType: 'audio/mp3',
            upsert: false,
          });

        if (uploadError) {
          console.error('❌ [Supabase Storage AI 음성 업로드 실패]:', JSON.stringify(uploadError));
        } else {
          const { data: publicUrlData } = this.supabase.storage
            .from('voice-bucket')
            .getPublicUrl(aiVoiceFileName);
          
          aiAudioUrl = publicUrlData.publicUrl;
          console.log(`💾 [Supabase Storage] AI 음성 업로드 성공! URL: ${aiAudioUrl}`);
        }
      } catch (ttsErr) {
        console.error('❌ [TTS & Storage 예외 발생]:', ttsErr);
      }
    } else {
      console.log(`🔇 [TTS Generation] 음소거 모드이거나 대답이 없어 음성 합성을 건너뜀`);
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
      (async () => {
        try {
          const embeddingValue = await this.getEmbedding(selectedReply + aiAnalysis.context);
          await this.interactionRepository.update(savedInteraction.id, {
            embedding: embeddingValue,
          });
        } catch (e) {
          console.error('백그라운드 임베딩 생성 실패:', e);
        }
      })();
    }

    return {
      success: true,
      interactionId: savedInteraction.id,
      audioUrl: audioUrl,
      aiAudioUrl: aiAudioUrl, // [MODIFIED] Base64 대신 URL 전달
      ...aiAnalysis,
      selectedReply,
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
      aiAudioUrl: result.aiAudioUrl, // [MODIFIED] Base64 대신 aiAudioUrl 전달
      action: result.action || 2,
    });

    return { success: true, message: '보호자 메시지가 인형에 전송되었습니다.' };
  }

  // [MODIFIED] gTTS 결과를 Buffer로 반환하는 메서드로 변경
  async synthesizeSpeechToBuffer(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const gtts = new gTTS(text, 'ko');
      const chunks: Buffer[] = [];
      const stream = gtts.stream();
      
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const audioBuffer = Buffer.concat(chunks);
        const elapsedTime = Date.now() - startTime;
        console.log(`✅ [gTTS Success] mp3 생성 완료 (${audioBuffer.length} bytes, 소요시간: ${elapsedTime}ms)`);
        resolve(audioBuffer);
      });
      stream.on('error', (err) => {
        console.error(`❌ [gTTS Error] 음성 합성 실패:`, err);
        reject(err);
      });
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
      console.error("DB 검색 에러:", err);
      return "기억 검색 중 오류 발생.";
    }
  }

  async applyFeedback(interactionId: number, selectedReply: string, score: 'good' | 'normal' | 'bad') {
    const feedback = this.feedbackRepository.create({
      interaction: { id: interactionId },
      selectedReply,
      score
    });
    await this.feedbackRepository.save(feedback);
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