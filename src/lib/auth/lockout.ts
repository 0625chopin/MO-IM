import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/data/supabase/env";

/**
 * D-020 계정 잠금 카운터 — `public.auth_attempts` 읽기·쓰기 (Task 030, 17일차 CREW).
 *
 * **`import "server-only"`(17일차, 팀장 판정)** — service-role 키(`SUPABASE_SERVICE_ROLE_KEY`)를
 * 다루는 파일이 클라이언트 번들에 잘못 딸려 들어가면 시크릿이 그대로 노출된다 — 이 파일에서는
 * 특히 중요한 가드다. `session.ts` docstring과 같은 근거(전이 import를 번들러 그래프 단위로 잡음).
 *
 * `auth_attempts`는 Task 028(CORE)이 이미 만들었고 Task 029A가 `anon`/`authenticated`
 * **완전 거부** RLS를 적용해 "서버 전용 테이블"로 확정했다(`rls-policies-029a.md` §5). 그래서
 * 이 파일만 예외적으로 **service-role 클라이언트**(RLS 우회)를 쓴다 — 이 클라이언트는 이 파일
 * 밖으로 내보내지 않는다.
 *
 * **`Database` 제네릭을 쓰지 않는다** — `eslint.config.mjs` zone 7이 `src/lib/auth/**`에
 * `@/lib/data/supabase/database.types`(도메인 스키마 타입) 딥 임포트를 허용하지 않는다(인프라
 * 3개 `server`·`client`·`env`만 예외). `auth_attempts`는 컬럼이 4개뿐인 단순 테이블이라 이 파일이
 * 직접 손으로 좁은 타입을 선언해도 부담이 크지 않다 — 스키마가 바뀌면(가능성 낮음, D-020 이후
 * 안정적) 여기 타입도 함께 고친다.
 */

interface AuthAttemptRow {
  attempted_at: string;
  succeeded: boolean;
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

export interface AuthAttemptRecord {
  attemptedAt: string;
  succeeded: boolean;
}

/** 로그인 시도 이력을 최신순으로 가져온다. `identifier`로 이미 필터링해 반환하므로
 *  `evaluateLoginLockout`(`lib/rules/auth-credentials.ts`)에 그대로 넘길 수 있다. */
export async function getRecentAuthAttempts(
  identifier: string,
  limit = 10,
): Promise<AuthAttemptRecord[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("auth_attempts")
    .select("attempted_at, succeeded")
    .eq("identifier", identifier)
    .order("attempted_at", { ascending: false })
    .limit(limit)
    .returns<AuthAttemptRow[]>();

  if (error || !data) {
    return [];
  }
  return data.map((row) => ({ attemptedAt: row.attempted_at, succeeded: row.succeeded }));
}

/** 로그인 시도 1건을 기록한다. 성공·실패 모두 기록한다 — `evaluateLoginLockout`이 "연속
 *  실패"를 세려면 성공 기록으로 사슬이 끊기는 것도 알아야 한다. */
export async function recordAuthAttempt(identifier: string, succeeded: boolean): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("auth_attempts").insert({ identifier, succeeded });
}
