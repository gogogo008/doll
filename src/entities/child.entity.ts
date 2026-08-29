import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Device } from './device.entity';
import { Interaction } from './interaction.entity';

// child.entity.ts
@Entity()
export class Child {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  age!: number;

  @Column()
  gender!: string;

  @Column({ type: 'text', nullable: true })
  characteristics!: string;

  // --- 🌟 맞춤형 치료 및 반응 제어 필드 추가 ---
  @Column({ type: 'varchar', length: 50, nullable: true })
  languageLevel!: string; // 예: "단어 표현 단계", "문장 구사 가능 등"

  @Column({ type: 'varchar', length: 50, nullable: true })
  intelligenceLevel!: string; // 예: "경계선 지능", "발달 지연" 등

  @Column({ type: 'varchar', length: 50, nullable: true })
  mentalAge!: string; // 예: "만 3세 수준"

  @Column({ type: 'boolean', default: false })
  isMuted!: boolean; // true면 인형 음소거 (출력 안 함)

  @Column({ type: 'boolean', default: false })
  isEchoMode!: boolean; // true면 아이의 말을 그대로 따라 하는 반복 모드 활성화
  // ------------------------------------------

  @Column({ type: 'text', nullable: true })
  customPrompt!: string;

  @ManyToMany(() => User, (user) => user.children)
  @JoinTable()
  users!: User[];
  
  @OneToOne(() => Device)
  @JoinColumn()
  device!: Device;

  @OneToMany(() => Interaction, (interaction) => interaction.child)
  interactions!: Interaction[];
  
  @Column({ unique: true, nullable: true })
  inviteCode!: string;
}