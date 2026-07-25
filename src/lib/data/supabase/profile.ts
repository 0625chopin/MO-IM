import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Id, Profile } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { getSupabasePublicEnv } from "./env";
import { toProfile } from "./mappers";
import { createSupabaseServerClient } from "./server";

import type { Database } from "./database.types";

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
 * `bio`·`anonymizedAt`·`deactivatedAt`·`handleChangedAt`은 RPC가 모르는 값이라 `null`로, `status`는 RPC 필터
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
    deactivatedAt: null,
    handleChangedAt: null,
    onboardingCompletedAt: null,
  }));
}

/**
 * `public.profiles.id`는 `auth.users.id`를 참조하는 FK이고 기본값이 없다(`schema-migration-028.md`)
 * — 즉 회원가입 직후 프로필 행을 만들려면 그 `id`를 알아야 한다. 그런데 이 프로젝트는 "Confirm
 * email"이 켜져 있어(`auth-integration-030.md` §3) 가입 직후에는 세션이 없는 것이 정상 흐름이다
 * — `auth.uid()`가 비어 있는 요청 컨텍스트에서는 `profiles_insert_self`(`id = auth.uid()`) RLS를
 * 통과할 수 없다. 그래서 `createProfile`만 예외적으로 service-role 클라이언트(RLS 우회)를 쓴다
 * — `src/lib/auth/lockout.ts`(CREW, Task 030)의 같은 패턴을 그대로 따랐다(공유 모듈로 뽑지
 * 않은 이유도 같다 — 이 클라이언트는 이 함수 밖으로 내보내지 않는다). `id`는 반드시 호출자가
 * `signUpWithPassword`(`@/lib/auth`)의 반환값에서 얻은 실 `auth.users.id`여야 한다 — 이 레이어는
 * CON-06 그대로 그 값을 검증하지 않고 신뢰한다(호출부는 `lib/actions/signup.ts` 하나뿐이다).
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

export interface CreateProfileInput {
  /** `auth.users.id`(= 새 `profiles.id`). I-046 해소 — 이 매개변수가 없으면 신규 가입자의
   *  프로필 행이 실 DB에 생기지 않아 로그인해도 `forbidden`(게스트 취급)이 된다. */
  id: Id;
  handle: string;
  displayName: string;
}

/** 회원가입 시 프로필 레코드 생성(FR-001의 데이터 계층 몫). 핸들 중복은 conflict(23505). */
export async function createProfile(input: CreateProfileInput): Promise<DataResult<Profile>> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: input.id, handle: input.handle, display_name: input.displayName })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return err("conflict", `handle "${input.handle}" 은 이미 사용 중이다.`);
    }
    throw error;
  }
  return ok(toProfile(data));
}

export type UpdateProfileInput = Partial<
  Pick<Profile, "displayName" | "avatarUrl" | "bio" | "searchOptOut">
>;

/**
 * 프로필 수정(FR-004). `profiles_update_self` RLS가 `id = auth.uid()`만 허용하므로 세션
 * 클라이언트(anon key + 쿠키)를 쓴다 — 남의 프로필을 이 함수로 고칠 수 없다. status·
 * anonymizedAt·handle은 여기로 받지 않는다(mock/profile.ts 원본 docstring과 같은 이유).
 */
export async function updateProfile(
  id: Id,
  patch: UpdateProfileInput,
): Promise<DataResult<Profile>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
      ...(patch.avatarUrl !== undefined ? { avatar_url: patch.avatarUrl } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.searchOptOut !== undefined ? { search_opt_out: patch.searchOptOut } : {}),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return err("not_found", `profile ${id} 를 찾을 수 없다.`);
  return ok(toProfile(data));
}

/**
 * 온보딩 완료 표시(FR-004, I-046 해소). `updateProfile`과 분리한 이유는 같다 — 시스템이 갱신
 * 시점을 결정하는 필드(가입 시각·탈퇴 시각과 같은 부류)를 사용자 입력 patch와 같은 경로로
 * 받지 않는다. 이미 완료된 온보딩을 다시 제출해도 시각을 덮어써 멱등하게 성공한다(재제출을
 * 막을 이유가 없다 — FR-004는 재제출 금지를 요구하지 않는다).
 */
export async function completeProfileOnboarding(id: Id): Promise<DataResult<Profile>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return err("not_found", `profile ${id} 를 찾을 수 없다.`);
  return ok(toProfile(data));
}

/**
 * 핸들 변경(FR-004 AC1, Task 015B). 30일 쿨다운 판정은 호출자(Server Action)의 몫이다
 * (mock/profile.ts 원본 docstring과 같은 분업). 이 함수는 새 핸들 중복(23505)·존재하지 않는
 * 프로필만 방어적으로 확인한다.
 */
export async function changeProfileHandle(
  id: Id,
  newHandle: string,
): Promise<DataResult<Profile>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ handle: newHandle, handle_changed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return err("conflict", `handle "${newHandle}" 은 이미 사용 중이다.`);
    }
    throw error;
  }
  if (!data) return err("not_found", `profile ${id} 를 찾을 수 없다.`);
  return ok(toProfile(data));
}
