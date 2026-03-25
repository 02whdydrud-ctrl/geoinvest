// ═══════════════════════════════════════════
//  중복 제거 (Dedup)
//  1차: URL 정규화 비교
//  2차: 제목 유사도 (간이 자카드)
// ═══════════════════════════════════════════

import type { RawArticle } from '@/lib/types';

/** URL에서 쿼리 파라미터·프래그먼트 제거 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

/** 단어 집합 기반 자카드 유사도 (0~1) */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
wordsA.forEach((w) => {
  if (wordsB.has(w)) intersection++;
});

const unionSet = new Set<string>();
wordsA.forEach((w) => unionSet.add(w));
wordsB.forEach((w) => unionSet.add(w));
const union = unionSet.size;
  return intersection / union;
}

const TITLE_SIMILARITY_THRESHOLD = 0.6;

/**
 * 기사 배열에서 중복을 제거한다.
 * - 같은 URL → 제거
 * - 제목 유사도 60% 이상 → 제거 (먼저 들어온 것 유지)
 */
export function dedup(articles: RawArticle[]): RawArticle[] {
  const seenUrls = new Set<string>();
  const kept: RawArticle[] = [];

  for (const a of articles) {
    const norm = normalizeUrl(a.url);

    // URL 중복
    if (seenUrls.has(norm)) continue;
    seenUrls.add(norm);

    // 제목 유사도 중복
    const isDupe = kept.some(
      (existing) => titleSimilarity(existing.title, a.title) >= TITLE_SIMILARITY_THRESHOLD
    );
    if (isDupe) continue;

    kept.push(a);
  }

  console.log(`[dedup] ${articles.length} → ${kept.length} (${articles.length - kept.length}건 제거)`);
  return kept;
}
