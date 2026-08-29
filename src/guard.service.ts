// src/doll/guard.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GuardService {
private genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  async checkSafety(text: string) {
    
    // [테스트용 필터링 로직]
    const forbiddenWords = ['욕설', '나쁜', '악당', '바보'];
    const isForbidden = forbiddenWords.some(word => text.includes(word));

    if (isForbidden) {
      return { isSafe: false, reason: "부적절한 단어가 포함되어 있습니다." };
    }
    const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `
    다음 텍스트가 유해한지 판단하세요.
    - 욕설, 폭력, 선정적 내용이 포함되면 유해합니다.
    - 무조건 JSON 형식으로만 응답하세요: {"isSafe": boolean, "reason": "간략한 이유"}
    
    텍스트: "${text}"
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  try {
    // JSON 부분만 추출 (```json ... ``` 제거)
    const jsonString = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonString);
  } catch (e) {
    // 파싱 실패 시 안전을 위해 차단 처리
    return { isSafe: false, reason: "필터링 시스템 오류" };
  }
}
}