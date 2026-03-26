// ═══════════════════════════════════════════
//  GET /api/home
//  메인 페이지 전체 데이터 반환 (캐시 우선)
// ═══════════════════════════════════════════

import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import type { HomeResponse, Article, Region } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await cachedFetch<HomeResponse>('home', async () => {
      // 시그널 (오늘 기준 최신 3건)
      const { data: signals } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);

      // 기사 (최신 20건)
      const { data: articles } = await supabase
        .from('articles')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(20);

      const arts = (articles ?? []) as Article[];

      // 오늘 / 어제 날짜 범위 계산 (UTC 기준)
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

      // 오늘 기사 impact_score 평균 → riskIndex
      const todayScores = arts
        .filter((a) => a.impact_score != null && new Date(a.published_at) >= todayStart)
        .map((a) => a.impact_score!);
      const riskIndex = todayScores.length > 0
        ? Math.round(todayScores.reduce((s, v) => s + v, 0) / todayScores.length)
        : (() => {
            // 오늘 기사 없으면 전체 최신 20건 평균
            const allScores = arts.filter((a) => a.impact_score != null).map((a) => a.impact_score!);
            return allScores.length > 0
              ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
              : 50;
          })();

      // 어제 기사 impact_score 평균 → riskDelta 계산
      const { data: yesterdayArticles } = await supabase
        .from('articles')
        .select('impact_score')
        .gte('published_at', yesterdayStart.toISOString())
        .lt('published_at', todayStart.toISOString())
        .not('impact_score', 'is', null);

      let riskDelta: number | null = null;
      if (yesterdayArticles && yesterdayArticles.length > 0) {
        const yScores = yesterdayArticles.map((a: { impact_score: number }) => a.impact_score);
        const yesterdayIndex = Math.round(yScores.reduce((s: number, v: number) => s + v, 0) / yScores.length);
        riskDelta = riskIndex - yesterdayIndex;
      }

      // 알림 (상위 5건)
      const alerts = arts.slice(0, 5).map((a) => ({
        level: (a.impact_score ?? 0) >= 70 ? 'red' as const
             : (a.impact_score ?? 0) >= 40 ? 'yellow' as const
             : 'green' as const,
        text: a.title,
        region: (a.region ?? '미분류') as Region,
        timestamp: a.published_at,
      }));

      return {
        signals: signals ?? [],
        articles: arts,
        riskIndex,
        riskDelta,
        marketData: [],
        alerts,
        updatedAt: new Date().toISOString(),
      };
    }, 5 * 60_000); // 5분 캐시

    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/home]', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
