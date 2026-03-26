// ═══════════════════════════════════════════
//  캐시 레이어 v2 — Supabase 기반
//  Vercel 서버리스 환경에서 인스턴스 간 공유 가능
//  인터페이스는 기존과 동일 (drop-in replacement)
// ═══════════════════════════════════════════

import { supabase } from './supabase';

/** 기본 TTL: 5분 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export const cache = {
  /**
   * 캐시에서 값 조회
   * 만료됐거나 없으면 null 반환
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const { data, error } = await supabase
        .from('cache')
        .select('data, expires_at')
        .eq('key', key)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error || !data) return null;
      return data.data as T;
    } catch {
      // 캐시 오류는 조용히 무시 (fetcher 폴백)
      return null;
    }
  },

  /**
   * 캐시에 값 저장 (UPSERT)
   * @param ttlMs 유효 시간 (밀리초). 기본 5분.
   */
  async set<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      await supabase
        .from('cache')
        .upsert({ key, data, expires_at: expiresAt, created_at: new Date().toISOString() });
    } catch {
      // 캐시 저장 실패는 조용히 무시
    }
  },

  /** 캐시 항목 삭제 */
  async del(key: string): Promise<void> {
    try {
      await supabase.from('cache').delete().eq('key', key);
    } catch {
      // 무시
    }
  },

  /** 만료된 항목 일괄 정리 */
  async purgeExpired(): Promise<number> {
    try {
      const { count } = await supabase
        .from('cache')
        .delete({ count: 'exact' })
        .lt('expires_at', new Date().toISOString());
      return count ?? 0;
    } catch {
      return 0;
    }
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
