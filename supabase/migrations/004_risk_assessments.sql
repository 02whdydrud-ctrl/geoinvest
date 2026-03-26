-- ═══════════════════════════════════════════
--  Migration 004: 지정학 리스크 평가 테이블
--  3분류 체계: ongoing_conflict / war_risk / global_risk
--  3축 스코어링: military / political / market
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS risk_assessments (
  id               TEXT PRIMARY KEY,
  category         TEXT NOT NULL CHECK (category IN ('ongoing_conflict', 'war_risk', 'global_risk')),
  region_key       TEXT NOT NULL UNIQUE,       -- 'russia-ukraine', 'taiwan-strait'
  label_ko         TEXT NOT NULL,
  label_en         TEXT NOT NULL,
  flag_emoji       TEXT NOT NULL DEFAULT '',
  -- 3축 스코어 (0-100)
  military_score   INTEGER NOT NULL DEFAULT 50 CHECK (military_score BETWEEN 0 AND 100),
  political_score  INTEGER NOT NULL DEFAULT 50 CHECK (political_score BETWEEN 0 AND 100),
  market_score     INTEGER NOT NULL DEFAULT 50 CHECK (market_score BETWEEN 0 AND 100),
  total_score      INTEGER NOT NULL DEFAULT 50 CHECK (total_score BETWEEN 0 AND 100),
  -- 설명
  summary_ko       TEXT NOT NULL DEFAULT '',
  -- 카테고리별 추가 필드
  intensity        TEXT CHECK (intensity IN ('high', 'medium', 'low')),
  end_probability  INTEGER CHECK (end_probability BETWEEN 0 AND 100),
  -- 표시 옵션
  highlighted      BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_category ON risk_assessments (category, sort_order);
CREATE INDEX IF NOT EXISTS idx_risk_total ON risk_assessments (total_score DESC);

-- RLS
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_read_public" ON risk_assessments FOR SELECT USING (true);
CREATE POLICY "risk_write_service" ON risk_assessments FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "risk_update_service" ON risk_assessments FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "risk_delete_service" ON risk_assessments FOR DELETE USING (auth.role() = 'service_role');

-- ── 리스크 이력 (일별 스냅샷, delta 계산용) ──
CREATE TABLE IF NOT EXISTS risk_history (
  id            TEXT PRIMARY KEY,
  region_key    TEXT NOT NULL REFERENCES risk_assessments(region_key),
  total_score   INTEGER NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_key, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_risk_history_lookup ON risk_history (region_key, snapshot_date DESC);

ALTER TABLE risk_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_history_read_public" ON risk_history FOR SELECT USING (true);
CREATE POLICY "risk_history_write_service" ON risk_history FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ═══ 초기 시드 데이터 ═══

-- ── 1. 현재 전쟁 (ongoing_conflict) ──
INSERT INTO risk_assessments (id, category, region_key, label_ko, label_en, flag_emoji, military_score, political_score, market_score, total_score, summary_ko, intensity, end_probability, highlighted, sort_order) VALUES
('oc-russia-ukraine', 'ongoing_conflict', 'russia-ukraine',
 '러시아-우크라이나 전쟁', 'Russia-Ukraine War', '🇺🇦🇷🇺',
 92, 85, 78, 86,
 '전면전 지속 중. 양측 소모전 양상. 에너지·곡물 시장 직접 영향.',
 'high', 8, false, 1),

('oc-israel-hamas', 'ongoing_conflict', 'israel-palestine',
 '이스라엘-팔레스타인 분쟁', 'Israel-Palestine Conflict', '🇮🇱🇵🇸',
 88, 82, 72, 82,
 '가자 교전 지속. 레바논·이란 확전 우려. 중동 원유 리스크 상존.',
 'high', 12, false, 2),

('oc-sudan', 'ongoing_conflict', 'sudan-civil-war',
 '수단 내전', 'Sudan Civil War', '🇸🇩',
 75, 60, 35, 59,
 'RSF vs SAF 내전 장기화. 인도주의 위기. 직접적 시장 영향은 제한적.',
 'medium', 15, false, 3),

('oc-myanmar', 'ongoing_conflict', 'myanmar-civil-war',
 '미얀마 내전', 'Myanmar Civil War', '🇲🇲',
 68, 55, 30, 53,
 '저항군 vs 군부. 희토류·주석 공급 일부 영향.',
 'medium', 10, false, 4);

-- ── 2. 전쟁 가능성 (war_risk) ──
INSERT INTO risk_assessments (id, category, region_key, label_ko, label_en, flag_emoji, military_score, political_score, market_score, total_score, summary_ko, highlighted, sort_order) VALUES
('wr-taiwan', 'war_risk', 'taiwan-strait',
 '대만해협', 'Taiwan Strait', '🇹🇼🇨🇳',
 72, 80, 95, 81,
 '중국 군사훈련 증가. 반도체 공급망 글로벌 최대 리스크. TSMC 의존도 핵심.',
 true, 1),

('wr-korean-peninsula', 'war_risk', 'korean-peninsula',
 '한반도', 'Korean Peninsula', '🇰🇷🇰🇵',
 65, 70, 68, 67,
 '북한 핵·미사일 위협 지속. 남북 긴장 고조. 한국 방산주 직접 영향.',
 false, 2),

('wr-south-china-sea', 'war_risk', 'south-china-sea',
 '남중국해', 'South China Sea', '🌊',
 58, 62, 55, 58,
 '중국-필리핀 해상 충돌 반복. 세계 해상 무역 30% 통과 해역.',
 false, 3),

('wr-iran-israel', 'war_risk', 'iran-israel',
 '이란-이스라엘', 'Iran-Israel Tensions', '🇮🇷🇮🇱',
 70, 75, 82, 75,
 '핵 프로그램 갈등. 직접 군사 충돌 시 원유 가격 급등 시나리오.',
 false, 4);

-- ── 3. 글로벌 리스크 (global_risk) ──
INSERT INTO risk_assessments (id, category, region_key, label_ko, label_en, flag_emoji, military_score, political_score, market_score, total_score, summary_ko, highlighted, sort_order) VALUES
('gr-hormuz', 'global_risk', 'hormuz-strait',
 '호르무즈 해협', 'Strait of Hormuz', '⛽',
 55, 65, 92, 70,
 '세계 원유 20% 통과. 이란 봉쇄 시 에너지 가격 급등. 에너지주 직결.',
 false, 1),

('gr-us-china-trade', 'global_risk', 'us-china-trade',
 '미-중 무역전쟁', 'US-China Trade War', '🇺🇸🇨🇳',
 30, 85, 90, 67,
 '관세·기술 수출통제 강화. 반도체·AI·배터리 공급망 재편 중.',
 false, 2),

('gr-arctic', 'global_risk', 'arctic-greenland',
 '북극·그린란드', 'Arctic & Greenland', '🧊',
 35, 55, 48, 45,
 '희토류·자원 경쟁. 미국-덴마크 그린란드 긴장. 장기 지정학 리스크.',
 false, 3),

('gr-europe-energy', 'global_risk', 'europe-energy',
 '유럽 에너지 위기', 'Europe Energy Crisis', '⚡',
 20, 60, 75, 51,
 'LNG 의존도 증가. 러시아 가스 차단 장기화. 유럽 산업 경쟁력 약화.',
 false, 4),

('gr-supply-chain', 'global_risk', 'global-supply-chain',
 '글로벌 공급망 교란', 'Global Supply Chain Disruption', '🚢',
 25, 50, 85, 53,
 '홍해 후티 공격, 파나마 운하 가뭄. 해운비 급등. 물류주·제조업 영향.',
 false, 5);
