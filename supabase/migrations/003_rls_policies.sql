-- ═══════════════════════════════════════════
--  Migration 003: Row Level Security 활성화
--  외부(anon/authenticated) 사용자의 직접 DB 접근 차단
--  API route는 service_role 키로 RLS 우회
-- ═══════════════════════════════════════════

-- ─── articles 테이블 ───
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- 읽기: 모든 사용자 허용 (공개 뉴스 데이터)
CREATE POLICY "articles_read_public"
  ON articles FOR SELECT
  USING (true);

-- 쓰기: service_role만 허용 (API route에서만 삽입)
CREATE POLICY "articles_write_service"
  ON articles FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "articles_update_service"
  ON articles FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "articles_delete_service"
  ON articles FOR DELETE
  USING (auth.role() = 'service_role');

-- ─── signals 테이블 ───
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signals_read_public"
  ON signals FOR SELECT
  USING (true);

CREATE POLICY "signals_write_service"
  ON signals FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "signals_update_service"
  ON signals FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "signals_delete_service"
  ON signals FOR DELETE
  USING (auth.role() = 'service_role');

-- ─── subscribers 테이블 ───
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- 읽기/쓰기: service_role만 허용 (개인정보 보호)
CREATE POLICY "subscribers_service_only"
  ON subscribers
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── cache 테이블 (Migration 002에서 이미 RLS ON) ───
-- cache는 이미 활성화되어 있으므로 정책만 추가
CREATE POLICY "cache_service_only"
  ON cache
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
