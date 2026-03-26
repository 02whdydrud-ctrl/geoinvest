// ═══════════════════════════════════════════
//  GET /api/home
//  메인 페이지 전체 데이터 반환 (캐시 우선)
//  v2: 리스크 평가 엔진 통합
// ═══════════════════════════════════════════

import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { loadRiskBoard } from '@/lib/risk/engine';
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

      // 알림 (상위 5건)
      const alerts = arts.slice(0, 5).map((a) => ({
        level: (a.impact_score ?? 0) >= 70 ? 'red' as const
             : (a.impact_score ?? 0) >= 40 ? 'yellow' as const
             : 'green' as const,
        text: a.title,
        region: (a.region ?? '미분류') as Region,
        timestamp: a.published_at,
      }));

      // v2: 리스크 보드 (3분류 + 3축 스코어링 + Top 3)
      const riskBoard = await loadRiskBoard(arts);

      return {
        signals: signals ?? [],
        articles: arts,
        riskIndex: riskBoard.globalRiskIndex,
        riskDelta: riskBoard.globalRiskDelta,
        riskBoard,
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
