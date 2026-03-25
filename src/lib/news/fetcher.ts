// ═══════════════════════════════════════════
//  뉴스 수집기 (News Fetcher)
//  GNews (메인) + NewsAPI (보조) + Finnhub (시장)
// ═══════════════════════════════════════════

import type { RawArticle } from '@/lib/types';

// ─── 검색 키워드 세트 ───

const GEOPOLITICAL_QUERIES = [
  'Ukraine Russia war energy',
  'Middle East Hormuz oil conflict',
  'US China semiconductor sanctions tariff',
  'Taiwan Strait military',
  'South China Sea shipping',
  'NATO defense budget Europe',
  'Korea defense export',
  'LNG Europe energy crisis',
  'Iran nuclear sanctions',
  'export controls technology',
];

// ─── GNews ───

async function fetchGNews(): Promise<RawArticle[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) {
    console.warn('[fetcher] GNEWS_API_KEY 미설정 — 건너뜀');
    return [];
  }

  const articles: RawArticle[] = [];

  // 상위 3개 쿼리만 돌림 (무료 100req/day 절약)
  const queries = GEOPOLITICAL_QUERIES.slice(0, 3);

  for (const q of queries) {
    try {
      const url = new URL('https://gnews.io/api/v4/search');
      url.searchParams.set('q', q);
      url.searchParams.set('lang', 'en');
      url.searchParams.set('max', '5');
      url.searchParams.set('sortby', 'publishedAt');
      url.searchParams.set('apikey', key);

      const res = await fetch(url.toString(), { next: { revalidate: 0 } });
      if (!res.ok) {
        console.error(`[gnews] ${res.status} for "${q}"`);
        continue;
      }

      const data = await res.json();
      for (const a of data.articles ?? []) {
        articles.push({
          source: 'gnews',
          title: a.title,
          description: a.description ?? '',
          url: a.url,
          publishedAt: a.publishedAt,
          content: a.content ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[gnews] fetch error for "${q}":`, err);
    }
  }

  return articles;
}

// ─── NewsAPI (보조 — GNews 대신 쓸 경우) ───

async function fetchNewsAPI(): Promise<RawArticle[]> {
  const key = process.env.NEWSAPI_KEY;
  if (!key) return [];

  const articles: RawArticle[] = [];
  const queries = GEOPOLITICAL_QUERIES.slice(0, 2);

  for (const q of queries) {
    try {
      const url = new URL('https://newsapi.org/v2/everything');
      url.searchParams.set('q', q);
      url.searchParams.set('language', 'en');
      url.searchParams.set('sortBy', 'publishedAt');
      url.searchParams.set('pageSize', '5');
      url.searchParams.set('apiKey', key);

      const res = await fetch(url.toString(), { next: { revalidate: 0 } });
      if (!res.ok) continue;

      const data = await res.json();
      for (const a of data.articles ?? []) {
        articles.push({
          source: 'newsapi',
          title: a.title,
          description: a.description ?? '',
          url: a.url,
          publishedAt: a.publishedAt,
          content: a.content ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[newsapi] error:`, err);
    }
  }

  return articles;
}

// ─── Finnhub (시장/종목 뉴스) ───

async function fetchFinnhub(): Promise<RawArticle[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];

  try {
    const url = new URL('https://finnhub.io/api/v1/news');
    url.searchParams.set('category', 'general');
    url.searchParams.set('token', key);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data: any[] = await res.json();
    return data.slice(0, 10).map((a) => ({
      source: 'finnhub',
      title: a.headline,
      description: a.summary ?? '',
      url: a.url,
      publishedAt: new Date(a.datetime * 1000).toISOString(),
      content: undefined,
    }));
  } catch (err) {
    console.error('[finnhub] error:', err);
    return [];
  }
}

// ─── 통합 수집 ───

/**
 * 모든 소스에서 기사를 가져온다.
 * GNews가 메인, NewsAPI/Finnhub는 보조.
 */
export async function fetchAllNews(): Promise<RawArticle[]> {
  const [gnews, newsapi, finnhub] = await Promise.allSettled([
    fetchGNews(),
    fetchNewsAPI(),
    fetchFinnhub(),
  ]);

  const results: RawArticle[] = [];

  if (gnews.status === 'fulfilled') results.push(...gnews.value);
  if (newsapi.status === 'fulfilled') results.push(...newsapi.value);
  if (finnhub.status === 'fulfilled') results.push(...finnhub.value);

  console.log(
    `[fetcher] 수집 완료: gnews=${gnews.status === 'fulfilled' ? gnews.value.length : 0}, ` +
    `newsapi=${newsapi.status === 'fulfilled' ? newsapi.value.length : 0}, ` +
    `finnhub=${finnhub.status === 'fulfilled' ? finnhub.value.length : 0}`
  );

  return results;
}
