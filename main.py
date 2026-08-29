from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.tree import DecisionTreeClassifier
from sklearn.tree import export_text
import psycopg2  # PostgreSQL 연동 라이브러리
import numpy as np
from datetime import datetime

app = FastAPI()

# =====================================================================
# 🛠️ [DB 설정] 내 데이터베이스(AWS RDS 등) 환경에 맞게 정보를 수정하세요.
# =====================================================================
DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres.trwgaxzjvxdjjzxfommg",
    "password": "akdmadldma!",
    "host": "aws-1-ap-northeast-2.pooler.supabase.com",
    "port": "6543"
}
def train_individual_model(child_id: int):
    """
    🎯 GeunWoo님의 핵심 요구사항: 아이 개개인 맞춤형 트리 학습
    데이터베이스에서 '특정 아이(childId)'의 interactions 데이터만 쏙 뽑아와서 
    그 아이만을 위한 독립된 의사결정트리를 즉석에서 학습시킵니다.
    """
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 💡 중요: WHERE "childId" = %s 조건을 넣어 다른 아이 데이터와 절대 섞이지 않게 필터링합니다.
        query = """
            SELECT "createdAt", "touchIntensity", "context" 
            FROM interactions 
            WHERE "childId" = %s;
        """
        cursor.execute(query, (child_id,))
        rows = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # 🛡️ 방어 코드: 데이터가 최소 5개 이상은 쌓여야 스무고개(트리) 경계선을 나눌 수 있습니다.
        if len(rows) < 5:
            print(f"ℹ️ [아이 ID: {child_id}] DB 데이터 부족 (현재 {len(rows)}개). 최소 5개 이상 쌓여야 개별 맞춤형 학습이 시작됩니다.")
            return None

        X_train = []
        y_label = []
        
        # ⏰ 데이터 가공: 시간 데이터를 분 단위(0~1439분) 숫자로 변환
        for row in rows:
            created_at: datetime = row[0]
            intensity: int = row[1]
            context: str = row[2]
            
            current_time_min = created_at.hour * 60 + created_at.minute
            
            X_train.append([current_time_min, intensity])
            y_label.append(context)
            
        # 🌳 이 아이만을 위한 전용 의사결정트리 생성 및 학습
        model = DecisionTreeClassifier(max_depth=5, random_state=42)
        model.fit(X_train, y_label)
        
        print(f"✅ [맞춤형 학습 완료] 아이 ID: {child_id}의 실제 데이터 {len(rows)}개로 전용 트리 훈련 성공!")
        
        # 💡 CMD 터미널 창에 이 아이의 트리가 어떤 기준으로 상황을 나누고 있는지 스무고개 지도를 시각화 출력합니다.
        try:
            tree_rules = export_text(model, feature_names=['time_min', 'intensity'])
            print(f"🌳 [아이 ID: {child_id}의 의사결정트리 규칙 내부 구조]:\n{tree_rules}")
        except Exception:
            pass
            
        return model

    except Exception as e:
        print(f"❌ [DB 오류] 아이 ID: {child_id}의 데이터를 가져오는 중 에러 발생: {e}")
        return None


# =====================================================================
# 📥 [데이터 규격] NestJS가 HTTP Post 통신으로 보내줄 데이터의 틀 정의
# =====================================================================
class RoutineRequest(BaseModel):
    child_id: int          # 💡 어떤 아이인지 구별할 고유 ID
    current_time_min: int  # 분 단위 시간 (예: 12시 5분 -> 725)
    intensity: int         # 충격 강도 (0~100)


# =====================================================================
# 🚀 [라우터] NestJS가 실시간으로 데이터를 찌르는 통신 창구 엔드포인트
# =====================================================================
@app.post("/predict-routine")
def predict_routine(data: RoutineRequest):
    print(f"🤖 [NestJS 요청 수신] 아이 고유ID: {data.child_id} | 시간: {data.current_time_min}분 | 충격강도: {data.intensity}")
    
    # 1. 요청이 들어온 해당 아이의 전용 모델을 실시간 학습/업데이트 진행
    model = train_individual_model(data.child_id)
    
    # 2. 만약 이 아이의 데이터가 아직 부족해서 모델이 리턴되지 않았다면?
    # 시스템이 멈추지 않도록 안전하게 기본값('식사')을 리턴하며 계속 데이터를 수집하게 만듭니다.
    if model is None:
        return {
            "context": "식사",  # 초반 데이터 수집기용 임시 가짜 정답
            "isOnRoutine": True,
            "probability": 100.0
        }
        
    # 3. 데이터가 충분하다면? 이 아이만의 데이터를 기반으로 자란 트리가 진짜 '개별 맞춤 예측'을 합니다.
    input_data = [[data.current_time_min, data.intensity]]
    predicted_context = model.predict(input_data)[0]
    
    # 4. 트리가 이 예측을 얼마나 확신하는지 확률 계산
    probabilities = model.predict_proba(input_data)[0]
    max_probability = float(np.max(probabilities) * 100)
    
    # 5. 루틴 준수 여부 예시 로직 (충격 감지 강도가 50 이상으로 때리는 수준이면 돌발 이탈 상태로 간주)
    is_on_routine = True
    if data.intensity >= 50:
        is_on_routine = False
        
    return {
        "context": predicted_context,              # 🌳 트리가 시간과 충격을 분석해 뽑아낸 이 아동의 맞춤 상황
        "isOnRoutine": is_on_routine,              # 루틴 이탈 여부
        "probability": round(max_probability, 1)     # 신뢰도 점수 (%)
    }