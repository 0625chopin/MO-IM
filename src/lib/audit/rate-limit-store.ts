import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/data/supabase/env";
import type { Id } from "@/lib/types";

/**
 * D-005·NFR-016 핸들 검색 레이트 리밋 카운터 — `public.handle_search_attempts` 읽기·쓰기
 * (Task 038, 18일차 BOARD).
 *
 * `src/lib/auth/resend-attempts.ts`와 완전히 같은 계약이다 — "이력을 가져오고, 판정은
 * `evaluateFixedWindowRateLimit`(`lib/rules/rate-limit.ts`, 순수 함수)에 맡기고, 허용된 시도만
 * 기록한다"는 3단계를 그대로 따른다. `handle_search_attempts`도 `anon`/`authenticated` 완전 거부
 * RLS라 service-role 클라이언트가 필요하다 — 이 클라이언트는 이 파일 밖으로 내보내지 않는다.
 */

interface HandleSearchAttemptRow {
  requested_at: string;
}

function createSupabaseServiceRoleClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았다 — .env.local을 확인한다.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 창(window) 판정에 필요한 만큼 넉넉히 가져온다 — 상한 20회/60초보다 여유 있게 40건을 조회해
 *  판정 시점에 정확히 몇 건이 최근 60초 안에 있는지 `evaluateFixedWindowRateLimit`이 셀 수
 *  있게 한다. */
const RECENT_ATTEMPTS_FETCH_LIMIT = 40;

export interface HandleSearchAttemptRecord {
  attemptedAt: string;
}

export async function getRecentHandleSearchAttempts(
  profileId: Id,
): Promise<HandleSearchAttemptRecord[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("handle_search_attempts")
    .select("requested_at")
    .eq("identifier", profileId)
    .order("requested_at", { ascending: false })
    .limit(RECENT_ATTEMPTS_FETCH_LIMIT)
    .returns<HandleSearchAttemptRow[]>();

  if (error || !data) {
    return [];
  }
  return data.map((row) => ({ attemptedAt: row.requested_at }));
}

/** 허용 판정이 난 시도만 기록한다(거부된 요청은 기록하지 않는다 — `recordResendAttempt`와 같은
 *  원칙, 어차피 다음 판정도 같은 윈도우를 다시 계산할 뿐이다). */
export async function recordHandleSearchAttempt(profileId: Id): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("handle_search_attempts").insert({ identifier: profileId });
}
