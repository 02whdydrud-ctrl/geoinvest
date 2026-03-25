// ═══════════════════════════════════════════
//  GET /api/signals?date=YYYY-MM-DD
//  오늘의 핵심 시그널 3건 반환
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/cache';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date')
      ?? new Date().toISOString().split('T')[0];

    const signals = await cachedFetch(
      `signals:${date}`,
      async () => {
        const { data, error } = await supabase
          .from('signals')
          .select('*')
          .eq('date', date)
          .order('created_at', { ascending: true })
          .limit(3);

        if (error) throw error;
        return data ?? [];
      },
      10 * 60_000 // 10분 캐시
    );

    return NextResponse.json({ signals });
  } catch (err) {
    console.error('[/api/signals]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
