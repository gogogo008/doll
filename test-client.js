const { io } = require('socket.io-client');

const socket = io('https://doll-1v83.onrender.com', {
  query: { deviceId: '1' }
});

socket.on('connect', () => {
  console.log('서버 연결 성공! Socket ID:', socket.id);

  // 1. 음성 시작 신호 전송
  console.log('audio_start 전송 중...');
  socket.emit('audio_start', { deviceId: '1' });

  // 2. 센서 데이터 전송
  setTimeout(() => {
    console.log('sensor 데이터 전송 중...');
    socket.emit('sensor', {
      deviceId: '1',
      pressure: [0, 25, 0, 0, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      imu: { accelX: 0.02, accelY: 0.15, accelZ: 9.81 }
    });
  }, 300);

  // 3. [추가] 가상의 오디오 청크 데이터 전송 (서버가 음성으로 인식하도록)
  setTimeout(() => {
    console.log('audio_chunk 전송 중...');
    // 서버의 parseToBuffer가 처리할 수 있는 임시 Buffer 또는 바이트 배열 전송
    socket.emit('audio_chunk', Buffer.from([1, 2, 3, 4, 5]));
  }, 600);

  // 4. 음성 종료 신호 전송
  setTimeout(() => {
    console.log('audio_end 전송 중...');
    socket.emit('audio_end');
  }, 1000);
});

socket.on('ai_response', (data) => {
  console.log('✨ 서버로부터 AI 응답 수신 성공!:', data);
  process.exit(0);
});

socket.on('error', (err) => {
  console.error('❌ 서버 에러 수신:', err);
});