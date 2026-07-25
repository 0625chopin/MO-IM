import "server-only";

import type { Id, Profile } from "@/lib/types";

import { toProfile } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * Profile 읽기 전용 실데이터 구현 (Task 031, FR-001 일부·FR-004·FR-006). Mock(`../mock/profile.ts`)
 * 과 동일한 시그니처(NFR-035). 쓰기(`createProfile`·`updateProfile`·`changeProfileHandle`)는
 * Task 032 몫 — 배럴이 `../mock/profile`에서 그대로 재노출한다.
 *
 * **`getProfileByHandle`과 `searchProfilesByHandle`은 서로 다른 근거로 서로 다르게 구현한다** —
 * 인계 문서(`src/lib/data/supabase/README.md`, `docs/decisions/rls-policies-029b.md` §7)를
 * 혼동하지 말 것.
 *
 * - `getProfileByHandle`은 FR-006 "핸들 검색" 기능이 아니라 **가입/초대 시 서버가 handle→id를
 *   재해석하는 내부 조회**다(`check-handle-availability.ts`·`invite-crew-member.ts`·`signup.ts`
 *   가 실제 소비자 — 셋 다 `.id`가 필요하다). `profile_search` RPC는 `id`를 반환하지 않으므로
 *   (029B가 의도적으로 제거, FR-020 인계 사항) 이 용도에 쓸 수 없다 — `profiles` 테이블을
 *   직접 정확 일치로 조회한다. `profiles_select_authenticated`(qual=true, 전 컬럼)가 이미 이
 *   조회를 허용한다.
 * - `searchProfilesByHandle`은 FR-006 검색이므로 **반드시 `profile_search` RPC를 경유**한다
 *   (NFR-013 3필드 제한). RPC는 정확 일치·대소문자 구분·단일 인자라 Mock의 `query`(부분
 *   일치, 대소문자 무시, `limit` 옵션)와 동작이 달라진다 — Mock 쪽이 FR-006 AC2("부분 일치
 *   불가")를 원래 어기고 있었으므로 이 차이는 **의도된 수정**이다(설계 문서 §8). RPC가 `id`를
 *   반환하지 않아 `Profile` 형태로 되돌리려면 없는 필드를 채워야 하는데, **`id`는 절대 신뢰
 *   가능한 값이 아니다**(빈 문자열 — 후속 동작에 쓰면 안 된다. 필요하면 `getProfileByHandle`로
 *   재조회). 이 함수는 현재 실제 소비자가 없다(grep 확인, 3.6절 FR-006 UI는
 *   `search-user-by-handle.ts`를 통해 `getProfileByHandle`을 직접 쓴다) — 향후 이 함수를
 *   연결할 때 이 제약을 반드시 함께 검토할 것.
 */

export async function getProfileById(id: Id): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

/**
 * 핸들 검색(FR-006) — `profile_search` RPC 경유(모듈 docstring 참고). RPC는 정확 일치 0~1건만
 * 반환하므로 `opts.limit`은 의미가 없다(항상 0~1건). `id`가 없는 항목은 `""`로 채우고, 그 외
 * `bio`·`anonymizedAt`·`handleChangedAt`은 RPC가 모르는 값이라 `null`로, `status`는 RPC 필터
 * 조건(`status='active'`)으로 이미 보장되므로 `"active"`로, `searchOptOut`은 RPC 필터
 * (`search_opt_out=false`)로 이미 보장되므로 `false`로 채운다 — 전부 "RPC를 통과했다는 사실"
 * 에서 안전하게 역산 가능한 값만 채우고, 역산 불가능한 `id`만 명시적으로 무효 표시한다.
 */
export async function searchProfilesByHandle(
  query: string,
  // Mock 시그니처 호환용(NFR-035) — profile_search RPC는 정확 일치라 0~1건만 반환하므로
  // limit이 의미가 없다(위 docstring). 사용하지 않지만 시그니처 자리는 유지한다.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  opts: { limit?: number } = {},
): Promise<Profile[]> {
  const handle = query.trim();
  if (!handle) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("profile_search", { p_handle: handle });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: "",
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: null,
    status: "active" as const,
    searchOptOut: false,
    anonymizedAt: null,
    handleChangedAt: null,
  }));
}
