// ═══════════════════════════════════════════
//  GET /api/cron/collect
//  Vercel Cron이 자동으로 Authorization: Bearer <CRON_SECRET> 헤더를 추가
//  외부 직접 호출 시에도 동일 헤더 필요
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/lib/news/pipeline';
import { cache } from '@/lib/cache';
import { saveRiskSnapshot } from '@/lib/risk/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel: 최대 60초 (Pro 플랜)

export async function GET(req: NextRequest) {
  // 보안: Authorization 헤더로 CRON_SECRET 검증 (URL 파라미터 방식 제거)
  const authHeader = req.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runPipeline();

    // 리스크 스냅샷 저장 (일별 이력, delta 계산용)
    await saveRiskSnapshot();

    // 파이프라인 완료 후 캐시 무효화 → 다음 요청에서 최신 데이터 즉시 반영
    await Promise.all([
      cache.del('home'),
      cache.del('recent-articles-context'),
      cache.purgeExpired(),
    ]);

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[/api/cron/collect]', err);
    return NextResponse.json(
      { error: 'Pipeline failed', detail: String(err) },
      { status: 500 }
    );
  }
}
