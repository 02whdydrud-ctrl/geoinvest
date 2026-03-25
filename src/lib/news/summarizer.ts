// ═══════════════════════════════════════════
//  AI 요약기 (Summarizer)
//  Claude API로 기사 → 한국어 투자 해석 생성
// ═══════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import type { SummarizeRequest, TagResult } from '@/lib/types';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Missing ANTHROPIC_API_KEY');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `당신은 "GeoInvest"의 AI 분석가입니다.
지정학 뉴스를 한국 주식 투자자 관점에서 해석합니다.

규칙:
1. 한국어로 답변합니다.
2. 핵심 요약은 2-3문장으로 간결하게.
3. 수혜/피해 종목과 섹터를 명시합니다.
4. 투자 시계(단기/중기)와 방향(↑↓→)을 제시합니다.
5. 단정적 투자 추천은 하지 않습니다. "~할 수 있다", "주목할 만하다" 같은 표현을 씁니다.
6. 짧고 명확하게.`;

/**
 * 기사 1건을 한국어 투자 해석으로 요약한다.
 * 태깅 결과를 컨텍스트로 제공하여 일관성 유지.
 */
export async function summarizeArticle(req: SummarizeRequest): Promise<string> {
  const claude = getClient();

  const userPrompt = `아래 뉴스를 한국 주식 투자자 관점에서 요약하세요.

제목: ${req.title}
내용: ${req.description}${req.content ? `\n본문: ${req.content.slice(0, 1000)}` : ''}

태깅 정보:
- 지역: ${req.tagResult.region ?? '미분류'}
- 리스크 유형: ${req.tagResult.riskType ?? '미분류'}
- 관련 섹터: ${req.tagResult.sectors.join(', ') || '없음'}
- 수혜 종목: ${req.tagResult.tickersGain.join(', ') || '없음'}
- 피해 종목: ${req.tagResult.tickersLoss.join(', ') || '없음'}

형식:
📌 핵심 요약 (2-3문장)
▲ 수혜: 종목명
▼ 피해: 종목명
⏱ 투자 시계: 단기/중기 방향`;

  try {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return text;
  } catch (err) {
    console.error('[summarizer] Claude API error:', err);
    return '요약 생성 실패 — 잠시 후 다시 시도됩니다.';
  }
}

/**
 * 상위 N건의 기사만 요약한다 (API 비용 절약).
 * 이미 정렬된 배열을 받으므로 내부 정렬 생략 가능.
 * 반환: Map<url, summary>
 */
export async function summarizeTop(
  articles: { url: string; title: string; description: string; content?: string; tag: TagResult }[],
  topN = 5
): Promise<Map<string, string>> {
  const top = articles.slice(0, topN);
  const results = new Map<string, string>();

  // 순차 호출 (rate limit 안전)
  for (const a of top) {
    const summary = await summarizeArticle({
      title: a.title,
      description: a.description,
      content: a.content,
      tagResult: a.tag,
    });
    results.set(a.url, summary);
  }

  return results;
}
