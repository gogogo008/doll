import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChildrenService } from './children.service';
import { ChildrenController } from './children.controller';
import { Child } from '../entities/child.entity';
import { Device } from '../entities/device.entity';
import { Interaction } from '../entities/interaction.entity';
import { GuardModule } from '../guard.module';
import { DollModule } from '../doll/doll.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Child, Device, Interaction]),
    GuardModule,
    DollModule, // 2. 여기 imports에 추가해야 GuardService를 사용할 수 있습니다.
  ],
  controllers: [ChildrenController],
  providers: [ChildrenService],
  exports: [ChildrenService], // 3. GuardService는 여기서 export 할 필요 없습니다.
})
export class ChildrenModule {}