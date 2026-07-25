import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "./env";

import type { Database } from "./database.types";

/**
 * I-065·D-047 — 익명(미인증) 회원가입 흐름의 핸들 존재 확인(blur) 레이트 리밋 카운터.
 * `public.handle_availability_check_attempts` 읽기·쓰기(20일차 CORE).
 *
 * `src/lib/audit/rate-limit-store.ts`(BOARD 소유, Task 038, D-005 핸들 검색 리밋)와 계약은
 * 같다 — "이력을 가져오고, 판정은 `evaluateFixedWindowRateLimit`(`lib/rules/rate-limit.ts`,
 * 순수 함수)에 맡기고, 허용된 시도만 기록한다." 다만 **위치가 다르다** — `src/lib/audit/**`
 * (zone 8)는 이번 회차 BOARD 소유 영역이라 손대지 않고, 이 신규 모듈은 zone 3
 * (`src/lib/data/supabase/**`, CORE 소유)에 둔다(팀장 지시). `src/lib/actions/**`(zone 6)는
 * `@supabase/*` 직접 import가 금지라(`eslint.config.mjs`) 이 조회·기록 함수가 여기 있어야
 * Server Action이 호출할 수 있다 — `src/lib/data`의 배럴(`index.ts`)을 통해 노출한다.
 *
 * identifier는 **IP 문자열**이다(`x-forwarded-for`, 호출부는 `check-handle-availability.ts`
 * 참고). `handle_search_attempts`(uuid, `profiles` FK)와 달리 미인증 호출이라 계정 식별자가
 * 없다 — 그래서 테이블도 별도로 판다(uuid FK 불가능, D-047 맥락 참고).
 */

interface HandleAvailabilityCheckAttemptRow {
  requested_at: string;
}

function createSupabaseServiceRoleClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았다 — .env.local을 확인한다.");
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** D-047 상한(10회/60초)보다 여유 있게 조회한다 — `handle_search_attempts`와 같은 여유 원칙. */
const RECENT_ATTEMPTS_FETCH_LIMIT = 20;

export interface HandleAvailabilityCheckAttemptRecord {
  attemptedAt: string;
}

export async function getRecentHandleAvailabilityCheckAttempts(
  ipIdentifier: string,
): Promise<HandleAvailabilityCheckAttemptRecord[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("handle_availability_check_attempts")
    .select("requested_at")
    .eq("identifier", ipIdentifier)
    .order("requested_at", { ascending: false })
    .limit(RECENT_ATTEMPTS_FETCH_LIMIT)
    .returns<HandleAvailabilityCheckAttemptRow[]>();

  if (error || !data) {
    return [];
  }
  return data.map((row) => ({ attemptedAt: row.requested_at }));
}

/** 허용 판정이 난 시도만 기록한다(거부된 요청은 기록하지 않는다 — `recordHandleSearchAttempt`
 *  와 같은 원칙, 어차피 다음 판정도 같은 윈도우를 다시 계산할 뿐이다). */
export async function recordHandleAvailabilityCheckAttempt(ipIdentifier: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("handle_availability_check_attempts").insert({ identifier: ipIdentifier });
}
