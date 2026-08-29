import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DollModule } from './doll/doll.module';
import { AuthModule } from './auth/auth.module';
import { ChildrenModule } from './children/children.module';



@Module({
  imports: [
    // 1. 환경 변수 설정 (.env 로드)
    ConfigModule.forRoot({
      isGlobal: true, // 다른 모든 모듈에서 process.env를 쓸 수 있게 해줍니다.
    }),

    // 2. 데이터베이스 연결 설정
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: true,
      logging: true,
    }),

    DollModule,
    AuthModule,
    ChildrenModule,
    
  ],
  controllers: [AppController],
  providers: [AppService,],
})
export class AppModule {}