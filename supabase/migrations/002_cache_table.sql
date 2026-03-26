-- ═══════════════════════════════════════════
--  Migration 002: 서버리스 캐시 테이블
--  인메모리 캐시 대체용 (Vercel 서버리스 호환)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cache (
  key        TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 만료된 캐시 조회 방지 인덱스
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache (expires_at);

-- RLS: 서비스 키만 접근 (service_role은 RLS 우회)
ALTER TABLE cache ENABLE ROW LEVEL SECURITY;
-- anon/authenticated 사용자는 캐시에 직접 접근 불가
-- (API route에서 service_role 키로만 접근)
