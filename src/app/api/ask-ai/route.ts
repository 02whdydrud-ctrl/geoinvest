// ═══════════════════════════════════════════
//  POST /api/ask-ai
//  사용자 질문 → Claude AI 투자 분석 응답
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { askAI } from '@/lib/ai/claude';
import { supabase } from '@/lib/supabase';
import { cache } from '@/lib/cache';
import type { AskAIRequest, Article } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = body.question?.trim();

    if (!question || question.length < 2) {
      return NextResponse.json(
        { error: '질문을 입력해주세요.' },
        { status: 400 }
      );
    }

    if (question.length > 500) {
      return NextResponse.json(
        { error: '질문은 500자 이내로 입력해주세요.' },
        { status: 400 }
      );
    }

    // 컨텍스트용 최근 기사 가져오기 (캐시 우선)
    const recentArticles = await cache.get<Article[]>('recent-articles-context');
    let context: AskAIRequest['context'] = undefined;

    if (recentArticles) {
      context = {
        recentArticles: recentArticles.slice(0, 5).map((a) => ({
          title: a.title,
          region: a.region!,
          sectors: a.sectors,
        })),
        riskIndex: 77, // 캐시에서 가져오거나 계산
      };
    } else {
      // DB에서 직접 조회
      const { data } = await supabase
        .from('articles')
        .select('title, region, sectors, impact_score')
        .order('published_at', { ascending: false })
        .limit(5);

      if (data && data.length > 0) {
        context = {
          recentArticles: data.map((a: any) => ({
            title: a.title,
            region: a.region ?? '미분류',
            sectors: a.sectors ?? [],
          })),
          riskIndex: Math.round(
            data
              .filter((a: any) => a.impact_score != null)
              .reduce((s: number, a: any) => s + a.impact_score, 0) /
              Math.max(data.filter((a: any) => a.impact_score != null).length, 1)
          ),
        };
        // 다음 조회를 위해 캐시
        await cache.set('recent-articles-context', data, 5 * 60_000);
      }
    }

    const result = await askAI({ question, context });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/ask-ai]', err);
    return NextResponse.json(
      { error: '분석 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
