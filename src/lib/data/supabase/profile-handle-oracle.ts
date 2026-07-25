import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Profile } from "@/lib/types";

import { getSupabasePublicEnv } from "./env";
import { toProfile } from "./mappers";

import type { Database } from "./database.types";

/**
 * **격리된 단일 책임 모듈(21일차, I-074 major, 팀장·DESIGN 교차검증 지시) — `getProfileByHandle`
 * 하나만 담는다.** 원래 `profile.ts`에 다른 조회 함수들과 함께 있었는데, `eslint.config.mjs`의
 * I-074 규칙(`noGetProfileByHandleFromBarrel`, `@/lib/data` 배럴 named import 제한)이
 * `src/lib/data/supabase/**` **내부**의 상대경로 import(`./profile`)까지는 막지 못한다는
 * 것이 DESIGN의 프로브로 실증됐다 — 새 형제 파일이 `import { getProfileByHandle } from
 * "./profile"`을 써도 tsc·lint 둘 다 통과했다(zone 3의 기존 규칙은 `noMockImpl` 하나뿐이었고,
 * import-name 제한은 지정자가 `"@/lib/data"`인 경우만 매칭해 상대경로엔 반응하지 않는다).
 *
 * **왜 상대경로 `paths` 확장(대안 ⓐ) 대신 파일 분리(대안 ⓑ)를 택했는가**: 상대경로 표기는
 * 호출부의 디렉터리 깊이에 따라 `./profile`·`../profile`·`../supabase/profile` 등으로
 * 계속 달라진다 — `src/lib/data/supabase/**`는 지금도 평평하지만 나중에 하위 폴더가 생기면
 * (`supabase/reports/*` 같은 패턴은 이미 있다) 이 표기가 늘어난다. `paths`(정확한 지정자
 * 문자열 매칭)로 모든 변형을 커버하려면 표기 종류만큼 항목을 추가해야 하고 하나라도
 * 놓치면 조용히 뚫린다 — 정확히 이번 major가 지적한 실패 모드를 반복하는 위험한 설계다.
 * 파일을 이 이름 하나로 격리하면 이중 별표(모든 하위 경로) + 슬래시 + 파일명 하나로 된
 * group 패턴 **한 줄**이 상대경로 깊이·표기와 무관하게 항상 매칭된다(위치 독립적,
 * 정확한 문자열은 `eslint.config.mjs`의 `noProfileHandleOracleRelative` 참고 — 여기서
 * 그 글자 그대로 옮기면 이 블록 주석이 조기 종료된다는 것을 직접 겪었다) — `eslint.config.mjs` zone 3의
 * 새 규칙이 이 방식이다. 배럴(`@/lib/data`)을 통한 named import 제한은 기존
 * `noGetProfileByHandleFromBarrel`이 그대로 담당한다(파일을 옮겨도 barrel export 이름
 * `getProfileByHandle`은 그대로라 그 규칙은 영향받지 않는다).
 *
 * `createSupabaseServiceRoleClient` 헬퍼는 `profile.ts`(`createProfile`이 쓴다)와 이 파일
 * 둘 다 각자 갖는다(중복, 의도적) — 공유 모듈로 뽑지 않은 이유는 원래 `profile.ts` docstring과
 * 같다: 이 클라이언트(service-role, RLS 완전 우회)를 그 함수 밖으로 내보내지 않는다는 원칙을
 * 두 파일이 각각 독립적으로 지킨다 — 공유 모듈로 뽑으면 그 자체가 세 번째 진입 표면이 된다.
 *
 * **아래는 이 함수가 `profile.ts`에 있던 20~21일차 동안 쌓인 설계 근거를 그대로 승계한다**
 * (내용은 옮기지 않고 요약만 — 전문은 `profile.ts` 모듈 docstring과 `docs/ISSUES.md`
 * I-058·I-065·I-074·I-084, `docs/prioritization-and-risks.md` D-047 참고):
 * - service-role로 조회하는 이유: 호출부 2곳(로그인 상태에서 타인 행 조회, `signup.ts`의
 *   `anon` 컨텍스트) 둘 다 세션 기반 RLS로는 애초에 도달할 수 없다.
 * - client-invokable RPC가 전혀 없다(19일차 major① 이후 삭제) — publishable key로는 이
 *   조회에 절대 도달할 수 없다. 호출자는 서버에서 실행되는 Next.js 코드뿐이다.
 * - FR-006 검색에 쓰면 안 된다 — 상태·옵트아웃 필터도 리밋도 없다. 검색은
 *   `searchProfilesByHandle`(`profile_search` RPC)만 쓴다.
 * - 상태 필터가 없는 이유: 핸들 유일성 확인은 탈퇴·정지 계정이 쓰던 핸들도 "이미 사용 중"으로
 *   봐야 한다.
 * - 실 소비자는 `check-handle-availability.ts`·`invite-crew-member.ts` 둘뿐이다. 익명
 *   컨텍스트 호출은 반드시 `checkHandleAvailabilityAction`(D-047, IP당 분당 10회)을 거쳐야
 *   한다(I-065 규약, 이번 회차 이 파일의 zone 3 규칙이 구조적으로 강제한다).
 * - `isSystemAdmin`은 항상 `false`로 고정한다(I-084 해소 원칙 승계) — "누가 부르는가"는 이
 *   파일의 ESLint 정적 검사가 막고, "불렀을 때 무엇이 새는가"는 이 고정값이 막는다.
 */

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

/**
 * handle→id 내부 재해석 전용 — FR-006 검색에 쓰지 않는다(위 모듈 docstring 참고). 익명
 * 컨텍스트에서 이 함수를 직접(허용된 진입점 외부에서) 호출하는 새 코드를 추가하지 않는다.
 */
export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...toProfile(data), isSystemAdmin: false } : null;
}
