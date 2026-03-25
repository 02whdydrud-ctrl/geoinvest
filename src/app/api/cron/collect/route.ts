// ═══════════════════════════════════════════
//  GET /api/cron/collect?secret=...
//  스케줄러(Vercel Cron / 외부)가 5~15분마다 호출
//  전체 뉴스 수집 파이프라인 실행
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/lib/news/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel: 최대 60초 (Pro 플랜)

export async function GET(req: NextRequest) {
  // 보안: CRON_SECRET 검증
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runPipeline();

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
