import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Child } from './child.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string; // 실제 구현 시 암호화 필수

  @Column()
  name!: string;

  @Column({ unique: true, nullable: true }) 
  phoneNumber!: string;

  @Column()
  role!: 'TEACHER' | 'PARENT'; // 역할 구분은 그대로 유지합니다.

 
  @ManyToMany(() => Child, (child) => child.users)
  children!: Child[];
}