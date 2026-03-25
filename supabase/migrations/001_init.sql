-- ═══════════════════════════════════════════
--  GeoInvest — Supabase 초기 마이그레이션
--  articles, signals, subscribers 테이블
-- ═══════════════════════════════════════════

-- 1) articles — 수집된 뉴스 기사
CREATE TABLE IF NOT EXISTS articles (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,                -- 'gnews' | 'newsapi' | 'finnhub'
  title         TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  published_at  TIMESTAMPTZ NOT NULL,
  summary       TEXT,                         -- AI 생성 요약
  region        TEXT,                         -- '러시아-우크라이나' 등
  risk_type     TEXT,                         -- 'war' | 'trade' | 'energy' | 'market' | 'political'
  sectors       TEXT[] DEFAULT '{}',          -- {'반도체', '메모리'}
  tickers_gain  TEXT[] DEFAULT '{}',          -- 수혜 종목
  tickers_loss  TEXT[] DEFAULT '{}',          -- 피해 종목
  impact_horizon TEXT,                        -- '단기 ↑ · 중기 →'
  impact_score  INTEGER,                      -- 0-100
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_articles_published   ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_region       ON articles (region);
CREATE INDEX IF NOT EXISTS idx_articles_url          ON articles (url);
CREATE INDEX IF NOT EXISTS idx_articles_impact_score ON articles (impact_score DESC);

-- 2) signals — 오늘의 핵심 시그널 (매일 3건)
CREATE TABLE IF NOT EXISTS signals (
  id                TEXT PRIMARY KEY,
  date              DATE NOT NULL,              -- YYYY-MM-DD
  title             TEXT NOT NULL,
  thesis            TEXT DEFAULT '',             -- AI 투자 해석
  region            TEXT NOT NULL,
  sectors           TEXT[] DEFAULT '{}',
  tickers_gain      TEXT[] DEFAULT '{}',
  tickers_loss      TEXT[] DEFAULT '{}',
  urgency           TEXT NOT NULL DEFAULT 'monitor',  -- 'critical' | 'opportunity' | 'monitor'
  source_article_ids TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_date ON signals (date DESC);

-- 3) subscribers — 이메일 구독자
CREATE TABLE IF NOT EXISTS subscribers (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  interests   TEXT[] DEFAULT '{}',       -- 관심 지역
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers (email);

-- ═══ Row-Level Security (선택) ═══
-- 서비스 키로만 접근하므로 RLS는 기본 OFF.
-- 프론트에서 직접 Supabase를 호출할 경우 활성화 필요.

-- ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
