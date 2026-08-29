// statistics-response.dto.ts

// 요일별 또는 주차별 수치
export class DetailRow {
  label!: string; // "월", "화" 또는 "1주", "2주" 등
  count!: number; // 상호작용 횟수
  avgIntensity!: number; // 평균 충격 강도
}

// 감정/상황 순위용
export class RankRow {
  name!: string; // "기쁨", "식사" 등
  count!: number; // 발생 횟수
}

// 분석 지표 구조 정의
export class ClinicalInsights {
  peakHours!: string[]; // ["14시", "17시"] 등 돌발 위험 시간대
  contextEmotionMatrix!: Record<string, Record<string, number>>; // 상황별 감정 분포 매트릭스
  emotionVarietyCount!: number; // 표현된 감정 종류 수
}

export class StatisticsResponseDto {
  totalCount!: number; // 총 상호작용 횟수
  avgIntensity!: number; // 기간 전체 평균 충격 강도
  timeline!: DetailRow[]; // 그래프용 시계열 데이터
  emotionRank!: RankRow[]; // 감정 비율 순위
  contextRank!: RankRow[]; // 상황 비율 순위
  
  clinicalInsights!: ClinicalInsights; 
}