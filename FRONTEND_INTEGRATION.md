# 프론트엔드 연동 가이드

기존 GeoInvest HTML 대시보드에 백엔드 API를 연결하는 방법.

---

## 방법 A: 가장 간단 — 스크립트 1줄 추가

기존 HTML 파일의 `</body>` 직전에 이 한 줄만 추가:

```html
<script src="/api-bridge.js"></script>
</body>
```

`api-bridge.js`가 자동으로:
- `/api/home` 호출 → 시그널·뉴스·리스크게이지·알림 교체
- `askAI()` → `/api/ask-ai` 호출로 교체 (실패 시 데모 폴백)
- `subscribe()` → `/api/subscribe` 호출로 교체
- `sel()` → `/api/news?region=` 필터 추가
- 30초마다 자동 새로고침

**기존 데모 데이터는 API 실패 시 폴백으로 유지됨** → 무중단 전환 가능.

---

## 방법 B: Next.js 페이지로 완전 이전

기존 HTML을 `src/app/page.tsx`로 이전하려면:

### 1단계: HTML → JSX 변환
- `class=` → `className=`
- `onclick=` → `onClick=`
- `style="..."` → `style={{...}}`
- `for=` → `htmlFor=`

### 2단계: 데이터 Fetch
```tsx
// src/app/page.tsx
async function getData() {
  const res = await fetch('http://localhost:3000/api/home', {
    next: { revalidate: 300 } // 5분 ISR
  });
  return res.json();
}

export default async function Home() {
  const data = await getData();
  return <Dashboard data={data} />;
}
```

### 3단계: 클라이언트 인터랙션
AI 분석, 검색, 구독은 `'use client'` 컴포넌트로 분리:
```tsx
'use client';
function AIChat() {
  const [answer, setAnswer] = useState('');

  async function ask(q: string) {
    const res = await fetch('/api/ask-ai', {
      method: 'POST',
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json();
    setAnswer(data.answer);
  }

  return (/* ... */);
}
```

---

## CORS 설정 (프론트와 백엔드가 다른 도메인일 때)

`next.config.js`에 추가:

```js
async headers() {
  return [{
    source: '/api/:path*',
    headers: [
      { key: 'Access-Control-Allow-Origin', value: 'https://your-frontend.com' },
      { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
      { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
    ],
  }];
}
```

---

## API 응답 구조 참고

### GET /api/home
```json
{
  "signals": [
    {
      "title": "미-중 HBM 수출 규제 확대",
      "urgency": "critical",
      "region": "미-중 무역전쟁",
      "sectors": ["메모리 반도체"],
      "tickers_gain": ["마이크론"],
      "tickers_loss": ["삼성전자", "SK하이닉스"]
    }
  ],
  "articles": [
    {
      "title": "...",
      "url": "https://...",
      "published_at": "2025-01-15T10:30:00Z",
      "summary": "AI가 생성한 투자 해석...",
      "region": "러시아-우크라이나",
      "risk_type": "war",
      "sectors": ["방위산업"],
      "tickers_gain": ["LIG넥스원", "한화에어로"],
      "tickers_loss": [],
      "impact_horizon": "단기 ↑ · 중기 ↑",
      "impact_score": 75
    }
  ],
  "riskIndex": 77,
  "alerts": [
    { "level": "red", "text": "우크라이나 에너지 인프라 공격", "region": "러시아-우크라이나" }
  ],
  "updatedAt": "2025-01-15T10:35:00Z"
}
```

### POST /api/ask-ai
```json
// 요청
{ "question": "방산주 단기 전망은?" }

// 응답
{
  "answer": "유럽 NATO 방산 예산 확대로 한국 방산주...",
  "relatedTickers": ["LIG넥스원", "한화에어로", "KAI"],
  "disclaimer": "투자 판단은 본인의 책임입니다."
}
```
