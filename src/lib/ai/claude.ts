// ═══════════════════════════════════════════
//  AI 투자 분석 (Chat)
//  프론트 "AI 투자 분석" 입력 → Claude 응답
// ═══════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import type { AskAIRequest, AskAIResponse } from '@/lib/types';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

const SYSTEM_PROMPT = `당신은 "GeoInvest"의 AI 투자 분석가입니다.
지정학 리스크가 한국 주식 시장에 미치는 영향을 분석합니다.

규칙:
1. 한국어로 답변합니다.
2. 구체적인 한국 종목/섹터 이름을 언급합니다.
3. 수혜(▲)와 피해(▼)를 명확히 구분합니다.
4. 단기(1-3개월)와 중기(6-12개월) 시계를 제시합니다.
5. "~할 수 있다", "주목할 만하다" 등 신중한 표현을 사용합니다. 단정적 투자 추천은 하지 않습니다.
6. 응답은 300자 이내로 간결하게.
7. 마지막에 "투자 판단은 본인의 책임입니다" 면책을 포함합니다.

관련 종목을 JSON 배열로도 별도 제공합니다.`;

export async function askAI(req: AskAIRequest): Promise<AskAIResponse> {
  const claude = getClient();

  let contextStr = '';
  if (req.context) {
    contextStr = `\n\n현재 맥락:
- 글로벌 리스크 지수: ${req.context.riskIndex}/100
- 최근 주요 기사:
${req.context.recentArticles
  .slice(0, 5)
  .map((a) => `  · [${a.region}] ${a.title} (${a.sectors.join(', ')})`)
  .join('\n')}`;
  }

  const userPrompt = `질문: ${req.question}${contextStr}

아래 JSON 형식으로만 답변하세요:
{
  "answer": "분석 내용 (한국어, 300자 이내)",
  "relatedTickers": ["종목1", "종목2"]
}`;

  try {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // JSON 파싱 시도
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return {
        answer: parsed.answer ?? raw,
        relatedTickers: parsed.relatedTickers ?? [],
        disclaimer: '투자 판단은 본인의 책임입니다. AI 분석은 참고용입니다.',
      };
    } catch {
      // JSON 파싱 실패 시 원문 그대로
      return {
        answer: raw,
        relatedTickers: [],
        disclaimer: '투자 판단은 본인의 책임입니다. AI 분석은 참고용입니다.',
      };
    }
  } catch (err) {
    console.error('[askAI] Claude API error:', err);
    return {
      answer: '분석 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      relatedTickers: [],
      disclaimer: '',
    };
  }
}
