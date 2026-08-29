import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { Interaction } from './interaction.entity';

@Entity()
export class Device {
  @PrimaryColumn() // ESP32에서 보내는 고유 ID를 PK로 사용 가능
  deviceId!: string;

  @Column()
  modelName!: string; // 예: "Bear_Doll_V1"

  // --- 기기 제어 관련 데이터 ---
  @Column({ type: 'int', default: 50 }) // 음량 0~100
  volume!: number;

 @Column({ type: 'int', default: 50 }) // led 세기
  ledpower!: number;

  @Column({ type: 'boolean', default: true })
  isPowerOn!: boolean;

  @OneToMany(() => Interaction, (interaction) => interaction.device)
  interactions!: Interaction[];
}