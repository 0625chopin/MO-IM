"use server";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { getRecentHandleSearchAttempts, recordHandleSearchAttempt } from "@/lib/audit/rate-limit-store";
import { getProfileByHandle } from "@/lib/data";
import { projectHandleSearchResult, type HandleSearchResult } from "@/lib/rules/handle-search";
import { checkPermission } from "@/lib/rules/permission";
import { evaluateFixedWindowRateLimit, HANDLE_SEARCH_RATE_LIMIT } from "@/lib/rules/rate-limit";

/**
 * FR-006 핸들 검색 Server Action(Task 015B, D-005). `UserSearchField`가 검색 버튼/제출 시점에
 * 직접 호출한다(`checkHandleAvailabilityAction`처럼 폼 action이 아니라 일반 함수 호출).
 *
 * **CREW의 Task 017A(멤버 초대 다이얼로그)가 그대로 재사용할 수 있는 시그니처**다 — 정확
 * 일치 조회 하나로 "계정 설정의 핸들 검색"과 "크루 초대 시 초대 대상 찾기"가 완전히 같은
 * 로직이기 때문이다(D-005 "핸들 검색은 전 회원에게 허용"이 두 맥락 모두에 적용된다).
 * **"전 회원"은 로그인한 회원 전체를 뜻하지 비로그인 방문자를 포함하지 않는다** —
 * `lib/rules/permission.ts`의 매트릭스는 `search:by_handle`에 `guest: "deny"`를 명시한다
 * (member 이상 role은 전부 "allow"). Task 017A도 이 함수를 재사용할 때 "전 회원 허용"을
 * "비로그인도 허용"으로 잘못 읽지 않도록 여기 명시해 둔다 — 아래 인증 검사가 바로 그 매트릭스
 * 행을 강제하는 지점이다. 초대 맥락에서만 필요한 것들(본인 핸들 여부·이미 멤버·이미 초대
 * 대기 중, FR-006 E2~E4)은 이 함수의 반환값이 아니라 **호출부**가 자신이 가진 크루 컨텍스트
 * (뷰어 세션·멤버십 목록)와 비교해서 판정한다 — 이 함수는 "그 핸들의 사용자가 검색에
 * 노출되는가"만 답한다.
 *
 * **인증·권한 검사가 여기 있다(6일차 교차검증 W-4, BOARD)** — `search:by_handle`은
 * `lib/rules/permission.ts`의 매트릭스에 `guest: "deny"`로 이미 정의된 행이다. `/settings`
 * 페이지의 라우트 가드만 믿고 이 Server Action 자체를 무방비로 두면, Next.js Server Action은
 * 그 페이지를 거치지 않고 **직접 POST로 호출될 수 있어**(Next.js 공식 문서 경고 — 이 팀의
 * `login.ts`도 같은 경고를 인용한다) 로그인하지 않은 클라이언트가 회원의 핸들·표시 이름·
 * 아바타를 조회할 수 있었다. 이 액션은 크루 스코프가 아니므로(매트릭스상 `member` 이상
 * 전부 동일하게 "allow") `resolveBoardViewer`처럼 멤버십을 조회할 필요 없이 "인증 여부"만으로
 * role을 좁힌다. **`update-account-profile.ts`·`change-account-handle.ts`(같은 Task)와
 * 같은 `getAuthSession()`/`isAuthenticated()` 형태로 맞췄다** — 한 Task 안에서 세 액션의
 * 인증 확인 방식이 다르면 다음 사람이 어느 게 정본인지 알 수 없기 때문이다.
 *
 * 권한이 없을 때도 **미존재·옵트아웃과 같은 모양**(`{ found: false }`)을 반환한다 — "권한
 * 없음"과 "결과 없음"을 구분하는 별도 필드를 두면 미인증 호출자에게 "그 핸들이 존재하는지"와
 * 무관하게 "너는 검색 자체를 할 수 없다"는 정보가 새어 나간다. 이 액션이 반환할 수 있는 모양은
 * 처음부터 `HandleSearchResult` 하나뿐이라 그럴 여지가 없다.
 *
 * **동일 코드 경로로 미존재·옵트아웃을 처리한다(R-012)**: `getProfileByHandle`은 정확 일치
 * 조회이고(부분 일치 없음, D-005·AC2), 그 결과를 무엇을 하든 바로
 * `projectHandleSearchResult`(순수 함수, `lib/rules/handle-search.ts`)에 넘긴다 — 이 액션
 * 자신은 "존재하지만 옵트아웃"과 "존재하지 않음"을 구분하는 조건문을 갖지 않는다. 그 판정
 * 함수 안에서 두 경우가 이미 같은 값으로 합쳐진다.
 *
 * **레이트 리밋(D-005·NFR-016, 계정당 분당 20회)이 여기 있다(Task 038, 18일차 BOARD)** —
 * `lib/audit/rate-limit-store.ts`가 `public.handle_search_attempts`를 읽고 쓰기만 하고, 판정은
 * `lib/rules/rate-limit.ts`의 `evaluateFixedWindowRateLimit`(순수 함수)이 한다. 초과 시
 * `{ found: false, rateLimited: true }`를 반환한다 — R-012가 요구하는 "미존재·옵트아웃 구분
 * 불가"와는 다른 축이다(자기 자신의 요청 빈도만 드러날 뿐 다른 계정의 존재 여부를 새지 않는다).
 * (NFR-012의 "권한 검사는 서버·RLS에서" 자체는 v0.2가 아니다 — v0.2로 미뤄도 되는 것은 RLS
 * 구현 쪽이고, 이미 있는 순수 함수 `checkPermission`을 여기서 호출하는 것은 비용이 0이라
 * 미룰 이유가 없었다. 이전 버전 주석이 이 둘을 혼동했던 것을 바로잡는다.)
 */
export async function searchUserByHandleAction(handleQuery: string): Promise<HandleSearchResult> {
  const session = await getAuthSession();
  const role = isAuthenticated(session) ? "member" : "guest";
  const permission = checkPermission({ role, action: "search:by_handle" });
  if (!permission.allowed || !isAuthenticated(session)) {
    return { found: false };
  }

  const attempts = await getRecentHandleSearchAttempts(session.profileId);
  const rateLimit = evaluateFixedWindowRateLimit(attempts, new Date().toISOString(), HANDLE_SEARCH_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return { found: false, rateLimited: true, retryAfterSeconds: rateLimit.retryAfterSeconds };
  }
  await recordHandleSearchAttempt(session.profileId);

  const handle = handleQuery.trim();
  if (!handle) {
    return { found: false };
  }

  const profile = await getProfileByHandle(handle);
  return projectHandleSearchResult(profile);
}
