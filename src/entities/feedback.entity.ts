import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Interaction } from './interaction.entity';

@Entity('feedbacks')
export class Feedback {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' }) // Enum 형태의 string 명시
  score!: 'good' | 'normal' | 'bad';

  @Column({ type: 'text' })
  selectedReply!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Interaction, (interaction) => interaction.feedbacks)
  @JoinColumn({ name: 'interactionId' }) // 외래 키 컬럼 명시
  interaction!: Interaction;

  @Column() // DB에 저장될 외래 키 컬럼
  interactionId!: number;
}