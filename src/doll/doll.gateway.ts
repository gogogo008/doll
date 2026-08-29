import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DollService } from './doll.service';
import { Injectable, Inject, forwardRef } from '@nestjs/common'; // 👈 Inject, forwardRef 추가

interface ClientSession {
  deviceId: string;
  pcmChunks: Buffer[];
  sensorEvents: any[];
  connectedAt: Date;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class DollGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private sessions = new Map<string, ClientSession>();

  constructor(
    @Inject(forwardRef(() => DollService))
    private readonly dollService: DollService,
  ) {}

  private parseToBuffer(chunk: any): Buffer | null {
    if (!chunk) return null;

    if (Buffer.isBuffer(chunk)) {
      return chunk;
    }
    if (chunk instanceof Uint8Array || chunk instanceof ArrayBuffer) {
      return Buffer.from(chunk as ArrayBuffer);
    }
    if (typeof chunk === 'object' && chunk.type === 'Buffer' && Array.isArray(chunk.data)) {
      return Buffer.from(chunk.data);
    }
    if (Array.isArray(chunk)) {
      return Buffer.from(chunk);
    }
    if (typeof chunk === 'string') {
      return Buffer.from(chunk, 'binary');
    }

    return null;
  }

  private parsePayload(data: any): any {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (error) {
        console.error(`[WebSocket] JSON 파싱 실패! 원본 데이터:`, data);
        return null;
      }
    }
    return data;
  }

  handleConnection(client: Socket) {
    try {
      const deviceId =
        (client.handshake.query.deviceId as string) ||
        (client.handshake.auth?.deviceId as string);

      if (!deviceId) {
        console.warn(`[WebSocket] deviceId 미전달로 연결 거부. Socket ID: ${client.id}`);
        client.disconnect();
        return;
      }

      client.join(deviceId);

      this.sessions.set(client.id, {
        deviceId: deviceId,
        pcmChunks: [],
        sensorEvents: [],
        connectedAt: new Date(),
      });

      console.log(`[WebSocket] 로봇 연결 성공 - Socket ID: ${client.id} | Device ID: ${deviceId}`);
    } catch (error) {
      console.error(`[WebSocket] handleConnection 예외 발생 (Socket ID: ${client.id}):`, error);
    }
  }

  handleDisconnect(client: Socket) {
    const session = this.sessions.get(client.id);
    if (session) {
      console.log(`[WebSocket] 로봇 연결 해제 - Device ID: ${session.deviceId} | Socket ID: ${client.id}`);
      this.sessions.delete(client.id);
    } else {
      console.log(`[WebSocket] 미등록 소켓 연결 해제 - Socket ID: ${client.id}`);
    }
  }

  @SubscribeMessage('sensor')
  handleSensor(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    try {
      const session = this.sessions.get(client.id);
      if (!session) {
        console.warn(`[Sensor] 세션을 찾을 수 없음 (Socket ID: ${client.id})`);
        return;
      }

      const payload = this.parsePayload(data);
      if (!payload) {
        console.warn(`[Sensor] 유효하지 않은 센서 데이터 수신 (Device: ${session.deviceId})`);
        return;
      }

      session.sensorEvents.push(payload);

      console.log(
        `[Sensor] Device: ${session.deviceId} | Event #${payload.event_id ?? 'N/A'} (${payload.state ?? 'unknown'}) 수신됨 (누적: ${session.sensorEvents.length}개)`,
      );
    } catch (error) {
      console.error(`[Sensor] handleSensor 예외 발생 (Socket ID: ${client.id}):`, error);
    }
  }

  /**
   * 2. 음성 녹음 시작 신호 수신
   */
  @SubscribeMessage('audio_start')
  handleAudioStart(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    try {
      const session = this.sessions.get(client.id);
      if (!session) {
        console.warn(`[AudioStart ⚠️] 세션을 찾을 수 없음 (Socket ID: ${client.id})`);
        return;
      }

      const prevChunkCount = session.pcmChunks.length;
      session.pcmChunks = []; // 이전 음성 버퍼 초기화

      const payload = this.parsePayload(data);
      if (payload?.deviceId) {
        session.deviceId = payload.deviceId;
      }

      console.log(`🎤 [AudioStart 🟢] 음성 수신 시작 준비 완료 | Device: ${session.deviceId} | 기존 잔여 청크(${prevChunkCount}개) 초기화됨`);
    } catch (error) {
      console.error(`[AudioStart ❌] handleAudioStart 예외 발생 (Socket ID: ${client.id}):`, error);
    }
  }

  /**
   * 3. PCM 음성 바이너리 청크 수신
   */
  @SubscribeMessage('audio_chunk')
  handleAudioChunk(@ConnectedSocket() client: Socket, @MessageBody() chunk: any) {
    try {
      const session = this.sessions.get(client.id);
      if (!session) {
        console.warn(`[AudioChunk ⚠️] 세션 없음 - 청크 무시됨 (Socket ID: ${client.id})`);
        return;
      }

      const bufferChunk = this.parseToBuffer(chunk);

      if (bufferChunk && bufferChunk.length > 0) {
        session.pcmChunks.push(bufferChunk);
        
        // 전체 누적 용량 계산
        const currentTotalBytes = session.pcmChunks.reduce((acc, cur) => acc + cur.length, 0);
        console.log(
          `🔊 [AudioChunk 📥] Chunk #${session.pcmChunks.length} 수신 | ` +
          `수신 크기: ${bufferChunk.length} bytes | ` +
          `누적 전송량: ${currentTotalBytes} bytes | ` +
          `Device: ${session.deviceId}`
        );
      } else {
        console.warn(
          `[AudioChunk ⚠️] 변환 실패 또는 0 byte 청크 수신 (Device: ${session.deviceId}) | 원본 데이터 타입: ${typeof chunk}`,
          chunk
        );
      }
    } catch (error) {
      console.error(`[AudioChunk ❌] handleAudioChunk 예외 발생 (Socket ID: ${client.id}):`, error);
    }
  }

  /**
   * 4. 음성 종료 & 전체 AI / RAG / DB 처리
   */
  @SubscribeMessage('audio_end')
  async handleAudioEnd(@ConnectedSocket() client: Socket) {
    const session = this.sessions.get(client.id);
    if (!session) {
      console.warn(`[AudioEnd ⚠️] 세션을 찾을 수 없음 (Socket ID: ${client.id})`);
      client.emit('error', { code: 'SESSION_NOT_FOUND', message: '소켓 세션을 찾을 수 없습니다.' });
      return;
    }

    const totalChunkCount = session.pcmChunks.length;
    const fullPcmBuffer = Buffer.concat(session.pcmChunks);
    const sensorEventCount = session.sensorEvents.length;

    console.log(`==================================================`);
    console.log(`🛑 [AudioEnd 🔴] 음성 전송 완료 신호 수신`);
    console.log(` Device ID: ${session.deviceId}`);
    console.log(` 수신 청크 개수: ${totalChunkCount} 개`);
    console.log(` 총 PCM 바이트 크기: ${fullPcmBuffer.length} bytes (${(fullPcmBuffer.length / 1024).toFixed(2)} KB)`);
    console.log(` 동시 수신 센서 이벤트: ${sensorEventCount} 개`);
    console.log(`==================================================`);

    if (fullPcmBuffer.length === 0) {
      console.warn(`[AudioEnd ⚠️ 경고] 수신된 음성 바이너리 데이터가 0 byte입니다. (Device: ${session.deviceId})`);
    }

    try {
      const startTime = Date.now();
      
      const result = await this.dollService.processFullInteraction(
        session.deviceId,
        fullPcmBuffer,
        session.sensorEvents,
      );

      const elapsedTime = Date.now() - startTime;
      console.log(`✅ [AudioEnd 성공] 상호작용 처리 완료 (총 소요시간: ${elapsedTime}ms) - Device: ${session.deviceId}`);

      client.emit('ai_response', result);

    } catch (error: any) {
      console.error(`==================================================`);
      console.error(`[AudioEnd Error ❌] Device ID: ${session.deviceId} 상호작용 처리 중 예외 발생!`);
      console.error(`에러 메시지:`, error?.message || error);
      console.error(`스택 트레이스:`, error?.stack || '스택 정보 없음');
      console.error(`==================================================`);

      client.emit('error', {
        code: 'INTERACTION_PROCESSING_FAILED',
        message: '상호작용 처리 중 오류가 발생했습니다.',
        detail: error?.message || 'Unknown error',
      });
    } finally {
      // 메모리 누수 방지 버퍼 초기화
      console.log(`🧹 [Session Reset] Device: ${session.deviceId} 버퍼 및 센서 데이터 초기화 완료`);
      session.pcmChunks = [];
      session.sensorEvents = [];
    }
  }

  /**
   * 💡 [신규 추가] 서비스 계층에서 보호자 메시지를 특정 기기(Room)로 푸시할 때 호출하는 메서드
   */
  sendParentMessageToDevice(deviceId: string, payload: any) {
    try {
      this.server.to(deviceId).emit('parent_message', payload);
      console.log(`🚀 [WebSocket Broadcast] Device ID (${deviceId})로 보호자 메시지 푸시 완료`);
    } catch (error) {
      console.error(`❌ [WebSocket Broadcast Error] Device ID (${deviceId}) 푸시 실패:`, error);
    }
  }
}