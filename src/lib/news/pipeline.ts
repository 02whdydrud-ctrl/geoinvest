// ═══════════════════════════════════════════
//  파이프라인 오케스트레이터
//  cron이 호출 → 전체 파이프라인 실행
// ═══════════════════════════════════════════

import { fetchAllNews } from '@/lib/news/fetcher';
import { dedup } from '@/lib/news/dedup';
import { tagArticles } from '@/lib/news/tagger';
import { summarizeTop } from '@/lib/news/summarizer';
import { supabase } from '@/lib/supabase';
import { cache } from '@/lib/cache';
import crypto from 'node:crypto';
import { loadRiskBoard } from '@/lib/risk/engine';
import type { Article, Signal, Urgency, Region, TagResult } from '@/lib/types';

// ID 생성 — Node 18+ crypto.randomUUID 사용
function genId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

/**
 * 전체 뉴스 수집 파이프라인을 실행한다.
 *
 * 1. 뉴스 수집 (GNews + NewsAPI + Finnhub)
 * 2. 중복 제거
 * 3. 키워드 기반 태깅
 * 4. DB 저장
 * 5. 상위 기사 AI 요약
 * 6. 시그널 생성
 * 7. 메인 페이지 캐시 갱신
 */
export async function runPipeline(): Promise<{
  fetched: number;
  deduped: number;
  saved: number;
  summarized: number;
}> {
  console.log('[pipeline] ▶ 시작');

  // 1. 수집
  const raw = await fetchAllNews();
  console.log(`[pipeline] 수집: ${raw.length}건`);

  // 2. 중복 제거
  const unique = dedup(raw);

  // 3. 태깅
  const tagged = tagArticles(unique);

  // 4. DB 저장 — 이미 있는 URL은 건너뜀
  let savedCount = 0;
  const articlesToSave: Article[] = [];

  for (const { article, tag } of tagged) {
    // URL 기준 중복 체크
    const { data: existing } = await supabase
      .from('articles')
      .select('id')
      .eq('url', article.url)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const row: Article = {
      id: genId(),
      source: article.source,
      title: article.title,
      url: article.url,
      published_at: article.publishedAt,
      summary: null, // 나중에 AI 요약으로 채움
      region: tag.region,
      risk_type: tag.riskType,
      sectors: tag.sectors,
      tickers_gain: tag.tickersGain,
      tickers_loss: tag.tickersLoss,
      impact_horizon: tag.impactHorizon,
      impact_score: tag.impactScore,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('articles').insert(row);
    if (!error) {
      savedCount++;
      articlesToSave.push(row);
    } else {
      console.error(`[pipeline] DB insert 실패: ${error.message}`);
    }
  }
  console.log(`[pipeline] DB 저장: ${savedCount}건`);

  // 5. 상위 기사 AI 요약
  //    임계값 없이 impactScore 상위 5건만 요약 (MVP 안정성)
  const toSummarize = [...tagged]
    .sort((a, b) => b.tag.impactScore - a.tag.impactScore)
    .slice(0, 5)
    .map(({ article, tag }) => ({
      url: article.url,
      title: article.title,
      description: article.description,
      content: article.content,
      tag,
    }));

  let summarizedCount = 0;
  try {
    const summaries = await summarizeTop(toSummarize, 5);

    // 요약 결과를 DB에 업데이트 — URL 기준 (유니크)
    for (const [url, summary] of summaries) {
      await supabase
        .from('articles')
        .update({ summary })
        .eq('url', url);
      summarizedCount++;
    }
  } catch (err) {
    console.error('[pipeline] 요약 실패:', err);
  }
  console.log(`[pipeline] AI 요약: ${summarizedCount}건`);

  // 6. 시그널 생성 (상위 3건)
  await generateSignals(tagged);

  // 7. 캐시 갱신
  await refreshHomeCache();

  console.log('[pipeline] ✅ 완료');
  return {
    fetched: raw.length,
    deduped: unique.length,
    saved: savedCount,
    summarized: summarizedCount,
  };
}

// ─── 시그널 생성 ───

async function generateSignals(
  tagged: { article: { title: string; url: string }; tag: TagResult }[]
) {
  // impactScore 상위 3건을 오늘의 시그널로
  const sorted = [...tagged]
    .filter(({ tag }) => tag.region !== null)
    .sort((a, b) => b.tag.impactScore - a.tag.impactScore)
    .slice(0, 3);

  const today = new Date().toISOString().split('T')[0];

  // 오늘 시그널 있으면 교체
  await supabase.from('signals').delete().eq('date', today);

  for (const { article, tag } of sorted) {
    let urgency: Urgency = 'monitor';
    if (tag.impactScore >= 70) urgency = 'critical';
    else if (tag.impactScore >= 50 && tag.tickersGain.length > tag.tickersLoss.length) urgency = 'opportunity';

    const signal: Signal = {
      id: genId(),
      date: today,
      title: article.title,
      thesis: '', // AI 요약에서 채워짐
      region: tag.region!,
      sectors: tag.sectors,
      tickers_gain: tag.tickersGain,
      tickers_loss: tag.tickersLoss,
      urgency,
      source_article_ids: [],
      created_at: new Date().toISOString(),
    };

    await supabase.from('signals').insert(signal);
  }
}

// ─── 캐시 갱신 ───

async function refreshHomeCache() {
  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  const { data: articles } = await supabase
    .from('articles')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(20);

  const arts = (articles ?? []) as Article[];

  // v2: 리스크 보드 로드
  const riskBoard = await loadRiskBoard(arts);

  const homeData = {
    signals: signals ?? [],
    articles: arts,
    riskIndex: riskBoard.globalRiskIndex,
    riskDelta: riskBoard.globalRiskDelta,
    riskBoard,
    marketData: [], // Finnhub/Polygon에서 별도 조회
    alerts: arts.slice(0, 5).map((a: Article) => ({
      level: a.impact_score && a.impact_score >= 70 ? 'red' as const
           : a.impact_score && a.impact_score >= 40 ? 'yellow' as const
           : 'green' as const,
      text: a.title,
      region: (a.region ?? '미분류') as Region,
      timestamp: a.published_at,
    })),
    updatedAt: new Date().toISOString(),
  };

  await cache.set('home', homeData, 10 * 60_000); // 10분 TTL
  console.log('[pipeline] 캐시 갱신 완료');
}

function calculateRiskIndex(articles: Article[]): number {
  if (articles.length === 0) return 50;
  const scores = articles
    .filter((a) => a.impact_score != null)
    .map((a) => a.impact_score!);
  if (scores.length === 0) return 50;
  return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
}
