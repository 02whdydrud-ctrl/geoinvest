// ═══════════════════════════════════════════
//  GET /api/news?region=...&q=...&limit=20
//  뉴스 기사 목록 조회 + 필터링
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const region = searchParams.get('region');
    const q = searchParams.get('q');
    const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50);

    let query = supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(limit);

    // 지역 필터
    if (region) {
      query = query.eq('region', region);
    }

    // 텍스트 검색 (제목 + 섹터)
    if (q) {
      query = query.or(`title.ilike.%${q}%,sectors.cs.{${q}}`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ articles: data ?? [] });
  } catch (err) {
    console.error('[/api/news]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
