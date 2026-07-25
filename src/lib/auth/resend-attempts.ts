import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/data/supabase/env";

/**
 * FR-001 E4 재발송 카운터 — `public.email_resend_attempts` 읽기·쓰기 (Task 030, 17일차 CREW,
 * BOARD 교차검증 major 지적 반영으로 추가).
 *
 * **왜 `auth_attempts`를 재사용하지 않았는가**: `auth_attempts`는 PRD §7 `AuthAttempt`(D-020
 * 로그인 시도 전용)로 이미 문서화된 타입이다. identifier 접두사(`resend:` 등)로 재발송
 * 이벤트를 같은 테이블에 얹을 수도 있었지만, 그러면 그 테이블의 문서화된 목적과 어긋나고
 * `evaluateLoginLockout`(로그인 잠금 판정)이 참조하는 데이터와 재발송 이벤트가 물리적으로
 * 섞여 있다는 오해를 살 수 있다 — 그래서 별도 테이블(`email_resend_attempts`)로 분리했다.
 * `lockout.ts`와 같은 이유로 service-role 클라이언트를 쓴다(이 테이블도 `anon`/`authenticated`
 * 완전 거부 RLS, `docs/decisions/auth-integration-030.md` §10 참고) — 그 클라이언트는 이
 * 파일 밖으로 내보내지 않는다.
 */

interface ResendAttemptRow {
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

export interface ResendAttemptRecord {
  attemptedAt: string;
}

/** 재발송 요청 이력을 최신순으로 가져온다. `identifier`(이메일)로 이미 필터링해 반환하므로
 *  `evaluateResendCooldown`(`lib/rules/auth-credentials.ts`)에 그대로 넘길 수 있다. */
export async function getRecentResendAttempts(
  identifier: string,
  limit = 10,
): Promise<ResendAttemptRecord[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("email_resend_attempts")
    .select("requested_at")
    .eq("identifier", identifier)
    .order("requested_at", { ascending: false })
    .limit(limit)
    .returns<ResendAttemptRow[]>();

  if (error || !data) {
    return [];
  }
  return data.map((row) => ({ attemptedAt: row.requested_at }));
}

/** 재발송 요청 1건을 기록한다. `evaluateResendCooldown`이 허용 판정을 내린 뒤에만 호출한다
 *  (거부된 요청은 기록하지 않는다 — 어차피 마지막 시도 시각 기준 쿨다운/1시간 창이 그대로
 *  유지되므로 추가 기록이 필요 없다, `recordAuthAttempt`와 같은 원칙). */
export async function recordResendAttempt(identifier: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("email_resend_attempts").insert({ identifier });
}
