// ═══════════════════════════════════════════
//  POST /api/subscribe
//  이메일 구독 등록
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body.email?.trim()?.toLowerCase();
    const interests = body.interests ?? [];

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: '유효한 이메일 주소를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 중복 체크
    const { data: existing } = await supabase
      .from('subscribers')
      .select('id')
      .eq('email', email)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ message: '이미 구독 중입니다.' });
    }

    const { error } = await supabase.from('subscribers').insert({
      id: crypto.randomUUID(),
      email,
      interests,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[/api/subscribe]', error);
      return NextResponse.json(
        { error: '구독 등록에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: '구독이 완료되었습니다!' });
  } catch (err) {
    console.error('[/api/subscribe]', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
