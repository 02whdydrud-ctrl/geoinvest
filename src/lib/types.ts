// ═══════════════════════════════════════════
//  GeoInvest — 공통 타입 정의
// ═══════════════════════════════════════════

/** 지역 태그 */
export type Region =
  | '러시아-우크라이나'
  | '중동 분쟁'
  | '미-중 무역전쟁'
  | '대만해협'
  | '남중국해'
  | '유럽 에너지'
  | '한반도';

/** 리스크 유형 태그 */
export type RiskType = 'war' | 'trade' | 'energy' | 'market' | 'political';

/** 영향 방향 */
export type ImpactDirection = 'up' | 'down' | 'neutral';

/** 시그널 긴급도 */
export type Urgency = 'critical' | 'opportunity' | 'monitor';

// ─── DB 테이블 대응 ───

export interface Article {
  id: string;
  source: string;            // 'gnews' | 'newsapi' | 'finnhub'
  title: string;
  url: string;
  published_at: string;      // ISO 8601
  summary: string | null;    // AI 생성 요약
  region: Region | null;
  risk_type: RiskType | null;
  sectors: string[];         // ['반도체', '메모리']
  tickers_gain: string[];    // 수혜 종목: ['LIG넥스원', '한화에어로']
  tickers_loss: string[];    // 피해 종목: ['삼성전자']
  impact_horizon: string | null; // '단기 ↑ · 중기 →'
  impact_score: number | null;   // 0-100
  created_at: string;
}

export interface Signal {
  id: string;
  date: string;              // YYYY-MM-DD
  title: string;
  thesis: string;            // AI가 생성한 투자 해석
  region: Region;
  sectors: string[];
  tickers_gain: string[];
  tickers_loss: string[];
  urgency: Urgency;
  source_article_ids: string[];
  created_at: string;
}

export interface Subscriber {
  id: string;
  email: string;
  interests: Region[];
  created_at: string;
}

// ─── API 응답 ───

export interface HomeResponse {
  signals: Signal[];
  articles: Article[];
  riskIndex: number;
  riskDelta: number | null;   // 어제 대비 변화 (null = 비교 불가)
  marketData: MarketTick[];
  alerts: AlertItem[];
  updatedAt: string;
}

export interface MarketTick {
  symbol: string;
  label: string;
  change: number;       // % 변동
  direction: ImpactDirection;
}

export interface AlertItem {
  level: 'red' | 'yellow' | 'green';
  text: string;
  region: Region;
  timestamp: string;
}

// ─── 뉴스 수집 파이프라인 ───

/** 외부 API에서 가져온 원본 기사 (태깅 전) */
export interface RawArticle {
  source: string;
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  content?: string;
}

/** 태깅 결과 */
export interface TagResult {
  region: Region | null;
  riskType: RiskType | null;
  sectors: string[];
  tickersGain: string[];
  tickersLoss: string[];
  impactHorizon: string | null;
  impactScore: number;
}

/** AI 요약 요청 */
export interface SummarizeRequest {
  title: string;
  description: string;
  content?: string;
  tagResult: TagResult;
}

/** AI 질의 응답 */
export interface AskAIRequest {
  question: string;
  context?: {
    recentArticles: Pick<Article, 'title' | 'region' | 'sectors'>[];
    riskIndex: number;
  };
}

export interface AskAIResponse {
  answer: string;
  relatedTickers: string[];
  disclaimer: string;
}
