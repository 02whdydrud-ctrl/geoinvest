// ═══════════════════════════════════════════
//  태거 (Tagger)
//  키워드/규칙 기반 → 지역·섹터·종목 태깅
//  MVP에선 규칙 기반, 나중에 AI 태깅으로 확장 가능
// ═══════════════════════════════════════════

import type { RawArticle, TagResult, Region, RiskType } from '@/lib/types';

// ─── 지역 매핑 규칙 ───

interface RegionRule {
  region: Region;
  keywords: string[];
  riskType: RiskType;
}

const REGION_RULES: RegionRule[] = [
  {
    region: '러시아-우크라이나',
    keywords: ['ukraine', 'russia', 'kyiv', 'moscow', 'crimea', 'donbas', 'zaporizhzhia', 'drone attack ukraine', 'nato eastern'],
    riskType: 'war',
  },
  {
    region: '중동 분쟁',
    keywords: ['middle east', 'iran', 'israel', 'hamas', 'hezbollah', 'hormuz', 'gaza', 'yemen', 'houthi', 'red sea', 'saudi'],
    riskType: 'war',
  },
  {
    region: '미-중 무역전쟁',
    keywords: ['us china', 'u.s. china', 'china tariff', 'semiconductor sanctions', 'export control', 'hbm', 'chip war', 'trade war', 'huawei', 'entity list'],
    riskType: 'trade',
  },
  {
    region: '대만해협',
    keywords: ['taiwan', 'strait', 'tsmc', 'pla navy', 'china military drill', 'taiwan defense'],
    riskType: 'political',
  },
  {
    region: '남중국해',
    keywords: ['south china sea', 'spratly', 'shipping lane', 'maritime dispute', 'paracel', 'sealane', 'freedom of navigation'],
    riskType: 'market',
  },
  {
    region: '유럽 에너지',
    keywords: ['europe energy', 'lng europe', 'nord stream', 'natural gas europe', 'eu energy', 'european gas'],
    riskType: 'energy',
  },
  {
    region: '한반도',
    keywords: ['north korea', 'korean peninsula', 'dprk', 'pyongyang', 'usfk', 'south korea defense', 'korea military'],
    riskType: 'political',
  },
];

// ─── 섹터 매핑 규칙 ───

interface SectorRule {
  sector: string;
  keywords: string[];
  tickersGain: string[];
  tickersLoss: string[];
  /** 어떤 지역과 결합 시 수혜/피해가 달라지는지 */
  regionModifiers?: Partial<Record<Region, { gain?: string[]; loss?: string[] }>>;
}

const SECTOR_RULES: SectorRule[] = [
  {
    sector: '방위산업',
    keywords: ['defense', 'military', 'weapon', 'missile', 'arms deal', 'defense budget', 'nato spending', 'k9', 'fa-50', 'artillery'],
    tickersGain: ['LIG넥스원', '한화에어로', 'KAI', '한화시스템'],
    tickersLoss: [],
  },
  {
    sector: '메모리 반도체',
    keywords: ['hbm', 'semiconductor', 'memory chip', 'dram', 'nand', 'chip export', 'high bandwidth memory'],
    tickersGain: [],
    tickersLoss: ['삼성전자', 'SK하이닉스'],
    regionModifiers: {
      '미-중 무역전쟁': { gain: ['마이크론', '국내파운드리'], loss: ['삼성전자', 'SK하이닉스'] },
      '대만해협': { loss: ['삼성전자', 'SK하이닉스', 'TSMC'] },
    },
  },
  {
    sector: '정유·항공',
    keywords: ['oil price', 'crude oil', 'wti', 'brent', 'refining', 'fuel cost', 'jet fuel', 'airline'],
    tickersGain: ['S-Oil', 'GS홀딩스'],
    tickersLoss: ['대한항공', '제주항공'],
  },
  {
    sector: '배터리·소재',
    keywords: ['battery', 'ev battery', 'lithium', 'cathode', 'electric vehicle tariff', 'ira'],
    tickersGain: ['LG에너지', '삼성SDI', 'POSCO홀딩스'],
    tickersLoss: [],
  },
  {
    sector: '조선·LNG',
    keywords: ['lng', 'shipbuilding', 'lng carrier', 'natural gas', 'ship order', 'lng tanker'],
    tickersGain: ['현대중공업', '삼성중공업', '한국가스공사'],
    tickersLoss: [],
  },
  {
    sector: '자동차·소비재',
    keywords: ['won dollar', 'exchange rate', 'krw', 'forex', 'auto export'],
    tickersGain: ['현대차', '기아'],
    tickersLoss: ['롯데쇼핑', 'CJ제일제당'],
  },
];

// ─── 태깅 함수 ───

function textOf(article: RawArticle): string {
  return `${article.title} ${article.description} ${article.content ?? ''}`.toLowerCase();
}

function matchKeywords(text: string, keywords: string[]): number {
  return keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
}

/**
 * 기사 1건에 대해 규칙 기반 태깅을 수행한다.
 */
export function tagArticle(article: RawArticle): TagResult {
  const text = textOf(article);

  // 1) 지역 판별 — 매칭 키워드 수가 가장 많은 지역
  let bestRegion: Region | null = null;
  let bestRiskType: RiskType | null = null;
  let bestRegionScore = 0;

  for (const rule of REGION_RULES) {
    const score = matchKeywords(text, rule.keywords);
    if (score > bestRegionScore) {
      bestRegion = rule.region;
      bestRiskType = rule.riskType;
      bestRegionScore = score;
    }
  }

  // 2) 섹터 판별 — 매칭되는 모든 섹터 수집
  const sectors: string[] = [];
  let allGain: string[] = [];
  let allLoss: string[] = [];

  for (const rule of SECTOR_RULES) {
    const score = matchKeywords(text, rule.keywords);
    if (score === 0) continue;

    sectors.push(rule.sector);

    // 지역에 따른 수혜/피해 수정
    const mod = bestRegion && rule.regionModifiers?.[bestRegion];
    if (mod) {
      allGain.push(...(mod.gain ?? rule.tickersGain));
      allLoss.push(...(mod.loss ?? rule.tickersLoss));
    } else {
      allGain.push(...rule.tickersGain);
      allLoss.push(...rule.tickersLoss);
    }
  }

  // 중복 제거
  allGain = [...new Set(allGain)];
  allLoss = [...new Set(allLoss)];

  // 3) 임팩트 스코어 — 단순 키워드 밀도 기반 (0-100)
  const totalKeywords = REGION_RULES.flatMap((r) => r.keywords).length +
    SECTOR_RULES.flatMap((s) => s.keywords).length;
  const totalHits = bestRegionScore + sectors.length;
  const impactScore = Math.min(100, Math.round((totalHits / totalKeywords) * 500));

  // 4) 투자 시계 (간단 규칙)
  let impactHorizon: string | null = null;
  if (bestRiskType === 'war') impactHorizon = '단기 ↑ · 중기 ↑';
  else if (bestRiskType === 'trade') impactHorizon = '단기 ↓ · 중기 →';
  else if (bestRiskType === 'energy') impactHorizon = '단기 ↑ · 중기 →';
  else if (bestRiskType === 'political') impactHorizon = '단기 → · 중기 ↓';

  return {
    region: bestRegion,
    riskType: bestRiskType,
    sectors,
    tickersGain: allGain,
    tickersLoss: allLoss,
    impactHorizon,
    impactScore,
  };
}

/**
 * 기사 배열 전체를 태깅한다.
 */
export function tagArticles(articles: RawArticle[]): { article: RawArticle; tag: TagResult }[] {
  return articles.map((article) => ({
    article,
    tag: tagArticle(article),
  }));
}
