// ═══════════════════════════════════════════
//  리스크 스코어링 엔진 v1
//  3축 가중 평균: 군사(40%) + 정치(30%) + 시장(30%)
//  뉴스 기사의 impact_score로 동적 조정
// ═══════════════════════════════════════════

import { supabase } from '../supabase';
import type { RiskAssessment, RiskBoard, Article } from '../types';

/** 가중치 설정 */
const WEIGHTS = {
  military: 0.40,
  political: 0.30,
  market: 0.30,
} as const;

/** 3축 가중 평균 계산 */
export function calcTotalScore(
  military: number,
  political: number,
  market: number
): number {
  return Math.round(
    military * WEIGHTS.military +
    political * WEIGHTS.political +
    market * WEIGHTS.market
  );
}

/** region 매핑: articles.region → risk_assessments.region_key */
const REGION_TO_KEY: Record<string, string> = {
  '러시아-우크라이나': 'russia-ukraine',
  '중동 분쟁': 'israel-palestine',
  '미-중 무역전쟁': 'us-china-trade',
  '대만해협': 'taiwan-strait',
  '남중국해': 'south-china-sea',
  '유럽 에너지': 'europe-energy',
  '한반도': 'korean-peninsula',
};

/**
 * 뉴스 기반 동적 스코어 조정
 * 최근 기사의 impact_score가 높으면 해당 지역 리스크 +보정
 * 기사가 없으면 서서히 감소 (mean-reversion)
 */
export function adjustScoreByNews(
  baseScore: number,
  recentArticleScores: number[]
): number {
  if (recentArticleScores.length === 0) return baseScore;

  const avgArticleImpact =
    recentArticleScores.reduce((s, v) => s + v, 0) / recentArticleScores.length;

  // 기사 평균 impact가 높으면 리스크 상승, 낮으면 하락
  // 최대 ±15점 조정
  const delta = Math.round(((avgArticleImpact - 50) / 50) * 15);
  return Math.max(0, Math.min(100, baseScore + delta));
}

/**
 * 리스크 보드 전체 로드
 * DB에서 risk_assessments 조회 + 최근 기사로 동적 조정
 */
export async function loadRiskBoard(
  recentArticles: Article[]
): Promise<RiskBoard> {
  // 1. DB에서 모든 리스크 항목 조회
  const { data: rawRisks } = await supabase
    .from('risk_assessments')
    .select('*')
    .order('sort_order', { ascending: true });

  const risks = (rawRisks ?? []) as RiskAssessment[];

  // 2. 지역별 최근 기사 impact_score 집계
  const regionScores: Record<string, number[]> = {};
  for (const article of recentArticles) {
    if (!article.region || article.impact_score == null) continue;
    const key = REGION_TO_KEY[article.region];
    if (!key) continue;
    if (!regionScores[key]) regionScores[key] = [];
    regionScores[key].push(article.impact_score);
  }

  // 3. 뉴스 기반 동적 조정 적용
  const adjusted = risks.map((r) => {
    const articleScores = regionScores[r.region_key] ?? [];
    if (articleScores.length === 0) return r;

    const adjMilitary = adjustScoreByNews(r.military_score, articleScores);
    const adjPolitical = adjustScoreByNews(r.political_score, articleScores);
    const adjMarket = adjustScoreByNews(r.market_score, articleScores);
    const adjTotal = calcTotalScore(adjMilitary, adjPolitical, adjMarket);

    return {
      ...r,
      military_score: adjMilitary,
      political_score: adjPolitical,
      market_score: adjMarket,
      total_score: adjTotal,
    };
  });

  // 4. 카테고리별 분류
  const ongoingConflicts = adjusted
    .filter((r) => r.category === 'ongoing_conflict')
    .sort((a, b) => b.total_score - a.total_score);

  const warRisks = adjusted
    .filter((r) => r.category === 'war_risk')
    .sort((a, b) => b.total_score - a.total_score);

  const globalRisks = adjusted
    .filter((r) => r.category === 'global_risk')
    .sort((a, b) => b.total_score - a.total_score);

  // 5. Top 3 고위험 (전체에서)
  const top3 = [...adjusted]
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 3);

  // 6. 종합 글로벌 리스크 지수 (전 항목 가중 평균, 상위 항목에 더 높은 가중치)
  const allScores = adjusted.map((r) => r.total_score).sort((a, b) => b - a);
  let weightedSum = 0;
  let weightSum = 0;
  allScores.forEach((score, i) => {
    const w = 1 / (i + 1); // 순위 가중치: 1, 1/2, 1/3, ...
    weightedSum += score * w;
    weightSum += w;
  });
  const globalRiskIndex = allScores.length > 0
    ? Math.round(weightedSum / weightSum)
    : 50;

  // 7. 어제 대비 변화 (risk_history에서)
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const { data: historyData } = await supabase
    .from('risk_history')
    .select('total_score')
    .eq('snapshot_date', yesterdayStr);

  let globalRiskDelta: number | null = null;
  if (historyData && historyData.length > 0) {
    const yesterdayAvg = Math.round(
      historyData.reduce((s: number, h: { total_score: number }) => s + h.total_score, 0) / historyData.length
    );
    globalRiskDelta = globalRiskIndex - yesterdayAvg;
  }

  return {
    ongoingConflicts,
    warRisks,
    globalRisks,
    globalRiskIndex,
    globalRiskDelta,
    top3,
  };
}

/**
 * 일별 스냅샷 저장 (CRON에서 호출)
 * 오늘 스코어를 risk_history에 기록
 */
export async function saveRiskSnapshot(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data: risks } = await supabase
    .from('risk_assessments')
    .select('region_key, total_score');

  if (!risks || risks.length === 0) return;

  const rows = risks.map((r: { region_key: string; total_score: number }) => ({
    id: `${r.region_key}-${today}`,
    region_key: r.region_key,
    total_score: r.total_score,
    snapshot_date: today,
  }));

  await supabase
    .from('risk_history')
    .upsert(rows, { onConflict: 'region_key,snapshot_date' });
}
