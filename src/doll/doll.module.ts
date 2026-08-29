// src/doll/doll.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DollController } from './doll.controller';
import { DollService } from './doll.service';
import { Interaction } from '../entities/interaction.entity';
import { Child } from '../entities/child.entity';
import { Device } from '../entities/device.entity';
import { User } from '../entities/user.entity'
import { DollGateway } from './doll.gateway';
import { Feedback } from '../entities/feedback.entity';
import { SupabaseProvider } from '../supabase/supabase.provider';


@Module({
  imports: [
    TypeOrmModule.forFeature([Interaction, Child, Device,User,Feedback]),
  ],
  controllers: [DollController],
  providers: [DollService,DollGateway,SupabaseProvider],
  exports: [DollService],
})
export class DollModule {}