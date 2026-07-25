import type { Profile } from "@/lib/types";

/**
 * 핸들 검색 결과 판정 — 순수 함수 (FR-006, D-005, NFR-013, R-012, Task 015B).
 *
 * **R-012가 요구하는 것**: "핸들이 존재하지 않음"과 "핸들은 존재하지만 검색 노출 옵트아웃"을
 * 사용자가 구분할 수 없어야 한다. 이 함수가 그 보장을 코드 구조로 강제하는 지점이다 — 아래
 * `projectHandleSearchResult`를 보면 두 경우가 **완전히 같은 return문 한 줄**로 수렴한다.
 * 호출자(Server Action)가 "없음"과 "옵트아웃"을 구분하는 branch를 따로 만들 수 없도록,
 * 애초에 그 구분이 판정 함수 밖으로 나가지 않게 막았다 — 이 함수를 통과하면 두 사례는 이미
 * 하나의 값(`{ found: false }`)이 되어 있어서, 그 이후 어떤 코드도 실수로 문구·상태코드·분기를
 * 다르게 줄 수 없다.
 *
 * **NFR-013이 요구하는 것**: 검색 응답은 핸들·표시 이름·아바타 **3필드만** 반환한다. 이 함수의
 * 반환 타입(`HandleSearchResult`)이 그 자체로 그 제약이다 — `found: true` 분기가 애초에
 * `Profile`의 다른 필드(`id`·`bio`·`status` 등)를 담을 자리가 없다. 참고로 프로필 `id`도 여기
 * 포함하지 않는다 — 초대(FR-020, Task 017A)처럼 실제로 그 사용자를 지목해야 하는 후속 동작은
 * 검색 결과가 아니라 **핸들 문자열을 다시 서버에 제출**해 서버가 그 시점에 다시 조회하게
 * 한다(id를 클라이언트에 노출하지 않는다).
 *
 * 남은 위험(문서화만, 이 함수의 책임 밖): Mock 스토어는 배열 `find`라 두 분기의 실행 시간
 * 차이가 이론상으로도 무시할 수준이다. 진짜 응답 지연 상수화는 이 함수의 책임 밖이다 — 지금은
 * "같은 코드 경로"까지만 보장한다.
 *
 * **`rateLimited`(Task 038, D-005·NFR-016)는 이 함수가 만들지 않는다** — `searchUserByHandleAction`
 * (`lib/actions/search-user-by-handle.ts`)이 `projectHandleSearchResult` 호출 전에 레이트 리밋을
 * 먼저 판정해 초과 시 이 함수를 아예 호출하지 않고 직접 반환한다. R-012가 막는 것과는 다른
 * 축이라(자기 계정의 요청 빈도만 드러나고 다른 계정의 존재 여부는 새지 않는다) `found: false`의
 * "동일 경로" 불변식을 깨지 않는 별도 필드로 얹었다.
 *
 * **`status !== "active"`도 이 한 줄로 합류한다(Task 039, 18일차 교차검증 minor 1)** —
 * 처음 추가한 시점(18일차)에는 이 앱 경로(`search-user-by-handle.ts`)가 `getProfileByHandle`
 * (`profiles` 정확 일치 조회, 상태 필터 없음)을 썼기 때문에 이 함수가 그 필터를 대신
 * 걸어야 했다. **19일차(I-058 major① 교차검증) 이후** `search-user-by-handle.ts`는
 * `searchProfilesByHandle`(`profile_search` RPC, 이미 `status='active' and search_opt_out
 * =false`로 필터됨)로 바뀌어 이 검사가 그 경로에서는 중복(방어적 이중 확인)이 됐다 — 그래도
 * 지우지 않는다. 이 함수는 `Pick<Profile, ...>`만 받는 순수 함수라 앞으로 다른 호출부가 상태
 * 필터 없는 조회 결과를 넘길 수도 있고, 그때도 R-012가 깨지지 않아야 하기 때문이다(D-029
 * 정신 — 근거 없이 제거하지 않는다). `getProfileByHandle`(handle→id 내부 재해석 전용,
 * service-role)은 이제 이 함수 계열의 소비자가 아니다. 상세: I-058, `docs/decisions/
 * rls-policies-029b.md` §17.
 */
export type HandleSearchResult =
  | { found: true; handle: string; displayName: string; avatarUrl: string | null }
  | { found: false; rateLimited?: boolean; retryAfterSeconds?: number };

export function projectHandleSearchResult(
  profile: Pick<Profile, "handle" | "displayName" | "avatarUrl" | "searchOptOut" | "status"> | null,
): HandleSearchResult {
  if (profile === null || profile.searchOptOut || profile.status !== "active") {
    // 미존재 · 옵트아웃 · 비활성(탈퇴 유예 중·정지) — 동일한 한 줄. 분기를 나누지 않는 것
    // 자체가 R-012 대응이다.
    return { found: false };
  }
  return {
    found: true,
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}
