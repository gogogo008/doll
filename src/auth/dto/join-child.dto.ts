// dto/join-child.dto.ts
import { IsString, Length } from 'class-validator';

export class JoinChildDto {
  @IsString()
  @Length(6, 6) // 초대 코드가 6자리라면 이렇게 제한할 수 있습니다.
  inviteCode!: string;
}