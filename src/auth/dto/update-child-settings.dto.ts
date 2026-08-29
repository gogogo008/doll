// update-child-settings.dto.ts
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateChildSettingsDto {
  @IsOptional()
  @IsBoolean()
  isMuted?: boolean;

  @IsOptional()
  @IsBoolean()
  isEchoMode?: boolean; // 에코랄리아(말 따라하기) 모드 활성화 여부

  @IsOptional()
  @IsString()
  languageLevel?: string; // 언어 수준 (예: "단어 표현 단계")

  @IsOptional()
  @IsString()
  intelligenceLevel?: string; // 지능 수준 (예: "경계선 지능")

  @IsOptional()
  @IsString()
  mentalAge?: string; // 정신 연령 (예: "만 3세 수준")

  @IsOptional()
  @IsString()
  customPrompt?: string;
}