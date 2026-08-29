import {Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany } from 'typeorm'; // ManyToOne 추가
import { Child } from './child.entity'; // Child 엔티티 임포트 추가
import { Device } from './device.entity';
import { Feedback } from './feedback.entity';

@Entity('interactions')
export class Interaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Device, (device) => device.interactions)
  device!: Device;

  // 관계 설정 부분
  @ManyToOne(() => Child, (child) => child.interactions)
  child!: Child;

  @Column({ type: 'varchar', length: 50, comment: '상황 분류 (식사, 공부, 놀이 등)' })
  context!: string;

  @Column({ type: 'text', nullable: true })
  rawText!: string;

  @Column({ type: 'int' })
  touchIntensity!: number;

  @Column()
  detectedEmotion!: string;

  @Column({ type: 'text' })
  aiReply!: string;

  @Column({ nullable: true })
  audioUrl!: string;

  
  
  @Column({ 
      type: 'text', // 벡터를 문자열 형태의 배열로 저장합니다. 예: "[0.12, 0.05, ...]"
      nullable: true 
    })
    embedding!: string; 

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'jsonb', nullable: true })
  candidateReplies!: { reply: string; style: string }[]; // 3개 후보 저장

  @OneToMany(() => Feedback, (feedback) => feedback.interaction)
  feedbacks!: Feedback[];

  
  
}