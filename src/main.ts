import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 데이터 변환 및 검증 파이프 설정
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,  //이상한 값을 탐지하고 삭제
    forbidNonWhitelisted: true, // 정의되지 않은 속성이 들어오면 에러 발생
  }));

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
  console.log(`🚀 백엔드 서버가 시작되었습니다!`);
  console.log(`📍 주소: http://localhost:${port}`);
}
bootstrap();