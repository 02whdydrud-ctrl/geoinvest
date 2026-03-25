# GeoInvest — 지정학 리스크 투자 대시보드

> **전쟁·분쟁 리스크를 한국 주식 섹터 언어로 번역합니다**

지정학 뉴스를 자동 수집·태깅·AI 요약하여 한국 주식 투자자에게 실시간 수혜/피해 종목 정보를 제공하는 풀스택 대시보드.

---

## 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│   기존 대시보드 UI — /api/home 호출하여 데이터 렌더링       │
└─────────┬────────────────────┬───────────────────────────┘
          │ GET /api/home      │ POST /api/ask-ai
          │ GET /api/news      │ POST /api/subscribe
          │ GET /api/signals   │
          ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                 Backend API (Route Handlers)              │
│   캐시 확인 → DB 조회 → JSON 응답                          │
└─────────┬────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│             In-Memory Cache (→ Cloudflare KV)            │
│   /api/home, /api/signals 응답 5~10분 TTL                 │
└──────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│               Supabase Postgres DB                       │
│   articles │ signals │ subscribers                       │
└──────────────────────────────────────────────────────────┘
          ▲
          │
┌──────────────────────────────────────────────────────────┐
│              Cron Pipeline (10분 주기)                     │
│                                                          │
│   1. GNews/NewsAPI에서 기사 수집                           │
│   2. 중복 제거 (URL + 제목 유사도)                          │
│   3. 키워드 기반 지역·섹터·종목 태깅                        │
│   4. DB 저장                                              │
│   5. 상위 5건 Claude AI 요약                               │
│   6. 오늘의 시그널 3건 생성                                 │
│   7. 홈 캐시 갱신                                          │
└─────────┬────────────────────┬───────────────────────────┘
          │                    │
          ▼                    ▼
   GNews / NewsAPI      Claude API (Sonnet)
   Finnhub              AI 요약 + 투자 분석
```

---

## 디렉터리 구조

```
geoinvest/
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── home/route.ts         # 메인 페이지 데이터
│   │       ├── news/route.ts         # 뉴스 목록 (필터링)
│   │       ├── signals/route.ts      # 오늘의 시그널
│   │       ├── ask-ai/route.ts       # AI 투자 분석
│   │       ├── subscribe/route.ts    # 이메일 구독
│   │       └── cron/collect/route.ts # 파이프라인 트리거
│   ├── lib/
│   │   ├── types.ts                  # 공통 타입
│   │   ├── supabase.ts               # DB 클라이언트
│   │   ├── cache.ts                  # 캐시 레이어
│   │   ├── news/
│   │   │   ├── fetcher.ts            # 뉴스 수집 (GNews+NewsAPI+Finnhub)
│   │   │   ├── dedup.ts              # 중복 제거
│   │   │   ├── tagger.ts             # 키워드 태깅
│   │   │   ├── summarizer.ts         # AI 요약 (Claude)
│   │   │   └── pipeline.ts           # 오케스트레이터
│   │   └── ai/
│   │       └── claude.ts             # AI 챗 분석
│   └── components/                   # (프론트 컴포넌트 — 추후)
├── supabase/
│   └── migrations/
│       └── 001_init.sql              # 테이블 생성 SQL
├── vercel.json                       # Cron 스케줄 설정
├── .env.example                      # 환경변수 템플릿
├── package.json
├── tsconfig.json
└── next.config.js
```

---

## 셋업 가이드

### 1. 프로젝트 클론 & 의존성 설치

```bash
git clone <repo-url> geoinvest
cd geoinvest
npm install
```

### 2. 외부 서비스 가입 (모두 무료 티어)

| 서비스 | 용도 | 필수 | 가입 |
|--------|------|------|------|
| **Supabase** | Postgres DB | ✅ 필수 | https://supabase.com |
| **GNews** | 뉴스 수집 (100req/day) | ✅ 필수 | https://gnews.io |
| **Anthropic** | AI 요약·분석 | ✅ 필수 | https://console.anthropic.com |
| **Finnhub** | 시장 뉴스 (60req/min) | ⬜ 선택 | https://finnhub.io |

> MVP는 Supabase + GNews + Anthropic 3개만 있으면 파이프라인이 돌아갑니다.
> Finnhub는 시장 뉴스 보강용이므로 나중에 추가해도 됩니다.

### 3. 환경변수 설정

```bash
cp .env.example .env.local
# .env.local에 API 키 입력
```

### 4. DB 테이블 생성

Supabase 대시보드 → SQL Editor에서 `supabase/migrations/001_init.sql` 실행.

### 5. 로컬 실행

```bash
npm run dev
# http://localhost:3000
```

### 6. 파이프라인 수동 테스트

```bash
curl "http://localhost:3000/api/cron/collect?secret=change-me-to-random-string"
```

### 7. Vercel 배포

```bash
vercel --prod
# 환경변수는 Vercel Dashboard > Settings > Environment Variables에서 설정
# Cron은 vercel.json이 자동 인식 (Pro 플랜 필요)
```

---

## API 명세

| Method | Endpoint | 설명 | 캐시 |
|--------|----------|------|------|
| `GET` | `/api/home` | 메인 페이지 전체 데이터 | 5분 |
| `GET` | `/api/news?region=...&q=...` | 뉴스 목록 (필터링) | — |
| `GET` | `/api/signals?date=YYYY-MM-DD` | 오늘의 시그널 3건 | 10분 |
| `POST` | `/api/ask-ai` | AI 투자 분석 | — |
| `POST` | `/api/subscribe` | 이메일 구독 등록 | — |
| `GET` | `/api/cron/collect?secret=...` | 파이프라인 실행 (cron) | — |

### POST /api/ask-ai 요청 예시

```json
{ "question": "방산주 단기 전망은?" }
```

### POST /api/subscribe 요청 예시

```json
{
  "email": "user@example.com",
  "interests": ["러시아-우크라이나", "미-중 무역전쟁"]
}
```

---

## 파이프라인 흐름

```
매 10분마다 실행:

  GNews API ──┐
  NewsAPI ────┼──▶ fetchAllNews() ──▶ dedup() ──▶ tagArticles()
  Finnhub ────┘                                        │
                                                       ▼
                                              ┌────────────────┐
                                              │   DB 저장       │
                                              │   (articles)    │
                                              └───────┬────────┘
                                                      │
                                              ┌───────▼────────┐
                                              │ summarizeTop() │
                                              │ (Claude API)   │
                                              └───────┬────────┘
                                                      │
                                              ┌───────▼────────┐
                                              │ generateSignals│
                                              │ (상위 3건)      │
                                              └───────┬────────┘
                                                      │
                                              ┌───────▼────────┐
                                              │ 캐시 갱신       │
                                              │ (home, signals)│
                                              └────────────────┘
```

---

## 확장 로드맵

1. **프론트 연동**: 현재 HTML 대시보드를 Next.js 페이지로 이전, `/api/home` fetch로 교체
2. **캐시 업그레이드**: 인메모리 → Cloudflare Workers KV (글로벌 엣지)
3. **뉴스 소스 추가**: Reuters API, Bloomberg, 한국 뉴스 (네이버 뉴스 RSS)
4. **AI 태깅**: 키워드 규칙 → Claude 기반 태깅으로 정확도 향상
5. **이메일 발송**: Resend/SendGrid로 매일 아침 8시 브리핑 이메일
6. **실시간 시장 데이터**: Polygon WebSocket으로 KOSPI, WTI, 환율 실시간 표시
7. **사용자 인증**: Supabase Auth로 개인 관심 종목 알림
8. **Telegram/Slack 봇**: 긴급 시그널 푸시 알림

---

## 비용 추정 (MVP)

| 항목 | 무료 한도 | 예상 비용 |
|------|-----------|-----------|
| GNews | 100 req/day | $0 |
| Finnhub | 60 req/min | $0 |
| Claude API | — | ~$5-15/월 (요약 5건 × 하루 6회) |
| Supabase | 500MB DB, 50K rows | $0 |
| Vercel | Hobby 무료, Cron은 Pro | $0-20/월 |
| **합계** | | **$5-35/월** |
