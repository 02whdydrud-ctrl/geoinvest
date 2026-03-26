// ═══════════════════════════════════════════
//  캐시 레이어
//  - 기본: 인메모리 Map (단일 인스턴스용)
//  - 프로덕션: Cloudflare Workers KV로 교체 가능
// ═══════════════════════════════════════════

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** 기본 TTL: 5분 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export const cache = {
  /**
   * 캐시에서 값 조회
   * 만료됐으면 null 반환 + 자동 삭제
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.data;
  },

  /**
   * 캐시에 값 저장
   * @param ttlMs 유효 시간 (밀리초). 기본 5분.
   */
  async set<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): Promise<void> {
    store.set(key, { data, expiresAt: Date.now() + ttlMs });
  },

  /** 캐시 항목 삭제 */
  async del(key: string): Promise<void> {
    store.delete(key);
  },

  /** 만료된 항목 일괄 정리 (주기적 호출 권장) */
  purgeExpired(): number {
    let purged = 0;
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) {
        store.delete(key);
        purged++;
      }
    }
    return purged;
  },
};

// ─── 편의 함수: 캐시 우선 조회, 없으면 생성 ───

/**
 * 캐시에 있으면 즉시 반환, 없으면 fetcher 실행 후 캐시 저장
 *
 * @example
 * const data = await cachedFetch('home', () => buildHomePage(), 5 * 60_000);
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const cached = await cache.get<T>(key);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  await cache.set(key, fresh, ttlMs);
  return fresh;
}
