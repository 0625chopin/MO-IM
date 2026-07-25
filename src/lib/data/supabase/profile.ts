import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Id, Profile, ProfileStatus } from "@/lib/types";

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
 * **19일차(I-058 해소) — `profiles_select_authenticated`가 self-row 전용으로 좁혀졌다**
 * (마이그레이션 `profiles_narrow_select_policy_and_public_profile_rpcs`). 예전에는 `qual=true`
 * 라 로그인한 아무 계정이나 `.select("*")`로 전 회원(21행)을 한 번에 덤프할 수 있었다 — 팀장
 * 실측으로 발견(`docs/ISSUES.md` I-058). `getProfileById`는 아래 **2단 폴백**으로 바뀌었다:
 * (1) 원본 테이블 직접 조회 — self-row면 그대로 전 컬럼이 나오고, 타인 행이면 RLS가 조용히
 * 0행을 반환한다. (2) 0행이면 `public.get_profile_public_by_id`(private SECURITY DEFINER +
 * public 얇은 INVOKER 래퍼, 029B와 같은 2단 구조)로 폴백해 **공개 필드만** 채운 `Profile`을
 * 반환한다(`bio`·`anonymizedAt`·`handleChangedAt`·`onboardingCompletedAt`은 이 경로가 절대
 * 모르는 값이라 `null`로 채운다 — `searchProfilesByHandle`이 이미 쓰던 것과 같은 원칙, 고정값
 * 으로 속이지 않는다). **호출부를 하나도 바꾸지 않은 이유**: 게시글·채팅·크루원 목록·초대함·
 * 모임 참석자 등 "작성자 표기"에 쓰이는 모든 소비자(전수 조사 완료, `rls-policies-029b.md`
 * §16)는 타인 행에서 `handle`·`displayName`·`avatarUrl` 3개만 읽는다 — 이 폴백이 정확히
 * 그 3개(+ `status`)를 채워 주므로 `getProfileById`의 시그니처·반환 타입을 그대로 유지한 채
 * 데이터 레이어 내부 구현만 바꿀 수 있었다(D-030 "조회부만 교체" 원칙과 같은 결의 적용).
 *
 * **19일차 팀장 교차검증 major① 수정 — `getProfileByHandle`은 `getProfileById`와 다른 방식이다.**
 * 처음엔 `getProfileById`와 같은 "직접조회 → `get_profile_public_by_handle` RPC 폴백" 구조로
 * 만들었으나, 그 RPC가 **`authenticated` EXECUTE + `STABLE`(부수효과 불가라 리밋을 넣을 수
 * 없는 구조) + `search_opt_out` 포함 반환**이라 "무제한 핸들 오라클"이 됐다 — publishable
 * key로 로그인한 아무 계정이나 임의 핸들의 존재 여부·옵트아웃 여부를 리밋 없이 얻을 수
 * 있었다(I-058이 닫으려던 것과 같은 종류의 구멍을 `profiles` 대신 이 새 RPC에 다시 연 것).
 * **부수적으로 발견한 라이브 회귀**: 그 RPC 폴백은 `signup.ts`(세션 생성 **전**, `anon`
 * 컨텍스트)에서 `permission denied for function`을 던져 회원가입 핸들 중복 검사가 예외로
 * 깨지고 있었다(`anon`은 이 RPC에 EXECUTE가 없다 — 아래 참고, `docs/ISSUES.md` I-062).
 *
 * 그래서 **`getProfileByHandle`은 이제 service-role 클라이언트로 직접 조회한다** — RLS를
 * 완전히 우회하므로(`service_role`은 `rolbypassrls=true`) self/타인/anon 컨텍스트 구분이
 * 필요 없어 2단 폴백 자체가 없다. **client-invokable RPC가 전혀 없으므로**(마이그레이션
 * `profiles_drop_public_handle_lookup_rpc_i058_major1`로 `public`/`private`
 * `get_profile_public_by_handle` 둘 다 삭제) publishable key로는 이 조회에 절대 도달할 수
 * 없다 — 이 함수를 부르는 것은 서버에서 실행되는 Next.js 코드(Server Action)뿐이고, 그
 * 코드가 결과에서 무엇을 노출할지(예: `checkHandleAvailabilityAction`은 boolean 하나만)
 * 결정한다. **이 함수는 여전히 FR-006 "핸들 검색"에 쓰면 안 된다** — 상태·옵트아웃 필터가
 * 없고 리밋도 없다(핸들→id 내부 재해석 전용 설계 그대로). FR-006은 `searchProfilesByHandle`
 * (`profile_search` RPC, SQL 강제 리밋 + 3필드 제한)만 쓴다 — `search-user-by-handle.ts`를
 * 그쪽으로 재배선했다.
 *
 * - `getProfileByHandle`의 실 소비자는 `check-handle-availability.ts`(가입/핸들 변경 시 중복
 *   확인, `.id`만 내부적으로 씀)·`invite-crew-member.ts`(초대 대상 handle→id 재해석)·
 *   `signup.ts`(가입 폼 핸들 중복 검사, `anon` 컨텍스트) 셋뿐이다 — 셋 다 화면에 `Profile`
 *   전체를 노출하지 않고 boolean/`id` 파생값만 쓴다.
 * - `searchProfilesByHandle`은 FR-006 검색이므로 **반드시 `profile_search` RPC를 경유**한다
 *   (NFR-013 3필드 제한, D-005 SQL 강제 레이트 리밋). RPC는 정확 일치·대소문자 구분·단일
 *   인자라 Mock의 `query`(부분 일치, 대소문자 무시, `limit` 옵션)와 동작이 달라진다 — Mock
 *   쪽이 FR-006 AC2("부분 일치 불가")를 원래 어기고 있었으므로 이 차이는 **의도된 수정**이다
 *   (설계 문서 §8). RPC가 `id`를 반환하지 않아 `Profile` 형태로 되돌리려면 없는 필드를 채워야
 *   하는데, **`id`는 절대 신뢰 가능한 값이 아니다**(빈 문자열 — 후속 동작에 쓰면 안 된다.
 *   필요하면 `getProfileByHandle`로 재조회).
 */

/** `get_profile_public_by_id` RPC가 채우지 못하는 필드의 공통 null 스텁 — `searchProfilesByHandle`
 *  이 이미 쓰던 것과 같은 값(고정값으로 속이지 않는다, 029B `profile_search` 문서 원칙). */
const UNKNOWN_PROFILE_FIELDS = {
  bio: null,
  anonymizedAt: null,
  deactivatedAt: null,
  handleChangedAt: null,
  onboardingCompletedAt: null,
} as const;

export async function getProfileById(id: Id): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (data) return toProfile(data);

  // I-058 — profiles_select_authenticated가 self-row 전용이라 타인 행은 위에서 0행(null)으로
  // 돌아온다. "작성자 표기" 등 정당한 타인 조회는 공개 필드 전용 RPC로 폴백한다(모듈 docstring).
  const { data: pub, error: pubError } = await supabase.rpc("get_profile_public_by_id", {
    p_id: id,
  });
  if (pubError) throw pubError;
  const row = pub?.[0];
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status as ProfileStatus,
    searchOptOut: false,
    ...UNKNOWN_PROFILE_FIELDS,
  };
}

/**
 * handle→id 내부 재해석 전용(모듈 docstring 참고) — FR-006 검색에 쓰지 않는다.
 * service-role 클라이언트로 조회한다: (1) `check-handle-availability.ts`·`invite-crew-
 * member.ts`는 로그인 상태에서 부르지만 대상 행이 대부분 타인 행이라 self-row로 좁힌 RLS로는
 * 애초에 조회가 안 되고, (2) `signup.ts`는 세션 생성 **전**(`anon` 컨텍스트)에 부르므로 RLS
 * 기반 어떤 경로도 통과할 수 없다 — 그래서 `service_role`(`rolbypassrls=true`)로 RLS 자체를
 * 우회한다. 이 함수를 호출할 수 있는 client-invokable RPC/PostgREST 엔드포인트가 없으므로
 * publishable key로는 이 조회에 도달할 방법이 없다(19일차 major① 수정, 아래 참고).
 *
 * 상태 필터가 없는 이유: 핸들 유일성 확인(가입·초대)은 탈퇴·정지 계정이 쓰던 핸들도 "이미
 * 사용 중"으로 봐야 한다(계정이 사라진 게 아니라 30일 유예/익명화 상태일 뿐이고, handle
 * UNIQUE 제약은 상태와 무관하게 걸려 있다).
 */
export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const supabase = createSupabaseServiceRoleClient();
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
